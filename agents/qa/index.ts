/**
 * agents/qa — QA Engineer reviewer
 *
 * Task 6.3.3 — Real implementation. Source-aware.
 *
 * Decides whether the product is technically sound: does it work,
 * is it stable, and does it meet baseline quality bars for
 * accessibility, performance, and error handling.
 *
 * The current implementation is **deterministic**: it scores
 * five rubric axes from signals already in the `EvidenceBundle`
 * (screenshots, page content, files, logs, accessibility, metrics)
 * and derives strengths / weaknesses / priority fixes from the
 * same signals. No LLM call is made. A future task will land
 * an LLM-backed variant; the `ReviewerFactory` is exported so
 * an LLM client can be injected without changing this module's
 * public surface (see `agents/contract.ts#ReviewerFactory`).
 *
 * Source-aware behavior (Task 3.4)
 *  - The reviewer's recommendations are phrased differently
 *    for browser sources (`website` / `private`) and code
 *    sources (`github` / `zip`).
 *  - For code sources, the QA lens evaluates:
 *      * does the project have a non-empty file tree?
 *      * is the README present and substantial?
 *      * is there a license?
 *      * is there a test directory or test files?
 *      * are there any project metadata signals (e.g. CI, lint,
 *        typecheck config files)?
 *  - For browser sources, the QA lens evaluates the same five
 *    rubric axes the original implementation used (with
 *    Lighthouse / page-content signals).
 *  - The final `priorityFixes` are passed through
 *    `agents/_lib/source.ts#containsBannedToken` so a
 *    `github` / `zip` review never produces a website-specific
 *    recommendation like "Improve Lighthouse performance" or
 *    "Capture screenshots for visual review".
 *
 * Persistence
 *  - `run()` is pure with respect to `ReviewerContext`; the
 *    orchestrator persists the result via
 *    `agents/qa/persistence.ts#saveReviewerResult`.
 *  - The mapping from the application `ReviewerId` to the
 *    Prisma `ReviewerType` enum is owned by the persistence
 *    helper, not by this module.
 *
 * Public surface (matches the `ReviewerModule` shape in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`      — the `ReviewerId` literal `'qa'`.
 *   - `qaReviewer`       — the object-shaped `Reviewer`.
 *   - `runReviewer`      — legacy function entry point that
 *                          delegates to `qaReviewer.run()`.
 *   - `createQaReviewer` — `ReviewerFactory` for DI of future
 *                          LLM clients.
 *   - `default`          — the `ReviewerModule` the orchestrator
 *                          consumes at registration time.
 */

import type { Reviewer, ReviewerFactory, ReviewerModule } from '@/agents/contract';
import type {
  PriorityFix,
  ReviewerContext,
  ReviewerDescriptor,
  ReviewerError,
  ReviewerFinding,
  ReviewerId,
  ReviewerOutput,
  ReviewerRubric,
  ReviewerRunOptions,
  RubricScore,
} from '@/agents/types';
import { REVIEWER_ROLES } from '@/agents/types';
import type { EvidenceBundle, ReviewSource } from '@/types/evidence';

import {
  containsBannedToken,
  hasAccessibility,
  hasFiles,
  hasMetrics,
  hasPageContent,
  hasScreenshots,
  isCodeSource,
  sourceLabel,
} from '@/agents/_lib/source';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEWER_ID = 'qa' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'qa',
  role: REVIEWER_ROLES.qa,
  description:
    'Decides whether the product is technically sound: does it work, is it stable, and does it meet baseline quality bars for accessibility, performance, and error handling.',
  defaultWeight: 0.2,
};

const rubric: ReviewerRubric = [
  {
    id: 'functionality',
    label: 'Functionality',
    description: 'Do the core pages render with expected content?',
    weight: 0.25,
  },
  {
    id: 'stability',
    label: 'Stability',
    description: 'Are there errors or warnings in the runtime logs?',
    weight: 0.2,
  },
  {
    id: 'performance',
    label: 'Performance',
    description: 'Lighthouse performance and related speed signals.',
    weight: 0.2,
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    description: 'WCAG-aligned accessibility findings (axe-core).',
    weight: 0.25,
  },
  {
    id: 'error-handling',
    label: 'Error handling',
    description: 'Does the product handle failure modes gracefully?',
    weight: 0.1,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

/* -------------------------------------------------------------------------- */
/* Analysis                                                                   */
/* -------------------------------------------------------------------------- */

type Analysis = {
  rubricScores: RubricScore[];
  findings: ReviewerFinding[];
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  overall: number;
  confidence: number;
  source: ReviewSource;
};

/**
 * Browser-source analysis: same five QA axes the original
 * implementation used. The findings / strengths / weaknesses /
 * priority fixes are framed for a live website (Lighthouse
 * scores, runtime logs, axe-core findings).
 */
const analyzeBrowser = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, logs, metrics } = evidence;

  // --- functionality -----------------------------------------------------
  let functionality = 30;
  const functionalitySignals: string[] = [];
  if (screenshots.items.length > 0) {
    functionality += 30;
    functionalitySignals.push(
      `${screenshots.items.length} screenshot${screenshots.items.length === 1 ? '' : 's'} captured`,
    );
  } else {
    functionalitySignals.push('no screenshots captured');
  }
  if (hasPageContent(evidence)) {
    // Narrowed: hasPageContent guarantees `pageContent` is present and non-empty.
    const pc = evidence.pageContent;
    functionality += 40;
    functionalitySignals.push(
      `page content present (${pc.headings.length} heading${pc.headings.length === 1 ? '' : 's'}, ` +
        `${pc.body.length} chars)`,
    );
  } else {
    functionalitySignals.push('no page content in evidence');
  }
  functionality = clamp(functionality, 0, 100);

  // --- stability ---------------------------------------------------------
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  const warnCount = logs.items.filter((l) => l.level === 'warn').length;
  const stability = clamp(100 - errorCount * 15 - warnCount * 3, 0, 100);
  const stabilityNote =
    errorCount === 0 && warnCount === 0
      ? 'No errors or warnings in the runtime logs.'
      : `${errorCount} error${errorCount === 1 ? '' : 's'} and ${warnCount} warning${warnCount === 1 ? '' : 's'} in the runtime logs.`;

  // --- performance -------------------------------------------------------
  let performance = 70;
  let performanceNote = 'No Lighthouse performance score in the evidence bundle.';
  if (metrics?.performance !== undefined) {
    performance = clamp(metrics.performance, 0, 100);
    performanceNote = `Lighthouse performance score: ${performance}/100.`;
  }

  // --- accessibility -----------------------------------------------------
  let accessibilityScore = 100;
  let accessibilityNote = 'No accessibility findings in the evidence bundle.';
  if (hasAccessibility(evidence)) {
    // Narrowed: hasAccessibility guarantees `accessibility` is present.
    const a = evidence.accessibility.summary;
    accessibilityScore = clamp(
      100 - a.critical * 20 - a.serious * 10 - a.moderate * 5 - a.minor * 2,
      0,
      100,
    );
    accessibilityNote =
      `${a.critical} critical, ${a.serious} serious, ${a.moderate} moderate, ` +
      `and ${a.minor} minor accessibility findings.`;
  }

  // --- error handling ----------------------------------------------------
  let errorHandling = 75;
  let errorHandlingNote = 'No runtime errors to evaluate error handling from.';
  if (errorCount > 0) {
    errorHandling = 50;
    errorHandlingNote =
      'Runtime errors present; visible handling (recovery messages, fallback UI) cannot be confirmed from the bundle alone.';
  } else if (warnCount > 0) {
    errorHandling = 80;
    errorHandlingNote = 'Warnings present but no errors; basic handling appears intact.';
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'functionality', score: functionality, note: functionalitySignals.join('; ') },
    { rubricId: 'stability', score: stability, note: stabilityNote },
    { rubricId: 'performance', score: performance, note: performanceNote },
    { rubricId: 'accessibility', score: accessibilityScore, note: accessibilityNote },
    { rubricId: 'error-handling', score: errorHandling, note: errorHandlingNote },
  ];

  const overall = round(
    functionality * 0.25 +
      stability * 0.2 +
      performance * 0.2 +
      accessibilityScore * 0.25 +
      errorHandling * 0.1,
  );

  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (hasPageContent(evidence)) evidencePoints += 1;
  if (hasAccessibility(evidence)) evidencePoints += 1;
  if (metrics?.performance !== undefined) evidencePoints += 1;
  if (logs.items.length > 0) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (hasAccessibility(evidence)) {
    const a = evidence.accessibility.summary;
    if (a.critical > 0) {
      findings.push({
        title: 'Critical accessibility violations',
        detail: `${a.critical} critical accessibility issue(s) detected. These typically block users who rely on assistive technology.`,
        category: 'accessibility',
        confidence: 0.9,
      });
    }
    if (a.serious > 0) {
      findings.push({
        title: 'Serious accessibility issues',
        detail: `${a.serious} serious accessibility issue(s) detected. Likely to materially impact users.`,
        category: 'accessibility',
        confidence: 0.85,
      });
    }
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Runtime errors detected',
      detail:
        `${errorCount} error-level log ${errorCount === 1 ? 'entry was' : 'entries were'} ` +
        'captured during analysis. Treat each as a candidate production crash or broken flow.',
      category: 'stability',
      confidence: 0.9,
    });
  }
  if (metrics?.performance !== undefined && performance < 50) {
    findings.push({
      title: 'Performance below 50',
      detail: `Lighthouse performance is ${performance}/100. The product likely feels slow on first load.`,
      category: 'performance',
      confidence: 0.8,
    });
  }
  if (screenshots.items.length === 0 && !hasPageContent(evidence)) {
    findings.push({
      title: 'No content evidence captured',
      detail:
        'The analyzer produced neither screenshots nor page content. The reviewer cannot confirm the product renders or functions.',
      category: 'functionality',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (stability >= 90) strengths.push('No errors or warnings in the runtime logs.');
  if (functionality >= 80) strengths.push('Core pages render with expected content.');
  if (hasAccessibility(evidence) && accessibilityScore >= 90) {
    strengths.push('No meaningful accessibility violations detected.');
  }
  if (metrics?.performance !== undefined && performance >= 85) {
    strengths.push(`Strong Lighthouse performance (${performance}/100).`);
  }
  if (errorCount === 0 && warnCount === 0) {
    strengths.push('Clean runtime logs across the analysis window.');
  }

  const weaknesses: string[] = [];
  if (errorCount > 0) {
    weaknesses.push(
      `${errorCount} runtime error${errorCount === 1 ? '' : 's'} in the analyzer logs.`,
    );
  }
  if (hasAccessibility(evidence) && evidence.accessibility.summary.critical > 0) {
    const critCount = evidence.accessibility.summary.critical;
    weaknesses.push(`${critCount} critical accessibility violation${critCount === 1 ? '' : 's'}.`);
  }
  if (metrics?.performance !== undefined && performance < 70) {
    weaknesses.push(`Lighthouse performance score is ${performance}/100.`);
  }
  if (screenshots.items.length === 0) {
    weaknesses.push('No visual evidence (screenshots) was collected.');
  }

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (hasAccessibility(evidence) && evidence.accessibility.summary.critical > 0) {
    priorityFixes.push({
      title: 'Fix critical accessibility violations',
      description:
        'Critical accessibility findings block users who rely on assistive technology. Address the top critical rule first, then re-run the analyzer.',
      effort: 'medium',
      impact: 'high',
    });
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve runtime errors in production paths',
      description:
        'Each error-level log is a candidate production crash or broken flow. Triage by frequency and reachability.',
      effort: 'medium',
      impact: 'high',
    });
  }
  if (metrics?.performance !== undefined && performance < 70) {
    priorityFixes.push({
      title: 'Improve Lighthouse performance score',
      description:
        'Run a Lighthouse audit on the main page; address the top opportunities (render-blocking resources, image weight, JS bundle size).',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (screenshots.items.length === 0) {
    priorityFixes.push({
      title: 'Capture screenshots for visual review',
      description:
        'Without screenshots, downstream reviewers cannot judge visual quality. Re-run the analyzer with the browser collector enabled.',
      effort: 'low',
      impact: 'medium',
    });
  }

  return {
    rubricScores,
    findings,
    strengths,
    weaknesses,
    priorityFixes,
    overall,
    confidence,
    source: evidence.metadata.source,
  };
};

/**
 * Code-source analysis: project-shape signals only. No Lighthouse,
 * no page content, no accessibility scans. The five rubric axes
 * are still produced, but the underlying signals come from
 * `files` (file tree, README, license) and `logs` (collector
 * errors during the fetch).
 */
const analyzeCode = (evidence: EvidenceBundle): Analysis => {
  const { logs, metrics } = evidence;

  // `hasFiles` narrows `evidence.files` to non-undefined.
  const files = hasFiles(evidence) ? evidence.files : undefined;
  const tree = files ? files.fileTree : [];
  const topLevel = files ? files.topLevel : [];
  const readme = files?.readme;
  const license = files?.license;
  const fileCount = tree.length;

  const readmeLength = readme?.length ?? 0;
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  const warnCount = logs.items.filter((l) => l.level === 'warn').length;

  // --- functionality -----------------------------------------------------
  // The "functionality" axis for a code source is "does the
  // project look like a real, runnable artifact?" — i.e. it
  // has source files, a README, and ideally a build / test
  // surface.
  let functionality = 30;
  const functionalitySignals: string[] = [];
  if (fileCount > 0) {
    functionality += 25;
    functionalitySignals.push(`${fileCount} file${fileCount === 1 ? '' : 's'} in the project tree`);
  } else {
    functionalitySignals.push('no file tree in the evidence bundle');
  }
  if (readme && readmeLength > 0) {
    functionality += 20;
    functionalitySignals.push(
      `README present (${readmeLength.toLocaleString()} char${readmeLength === 1 ? '' : 's'})`,
    );
  } else {
    functionalitySignals.push('no README in the project');
  }
  if (license) {
    functionality += 10;
    functionalitySignals.push('license present');
  }
  // Reward a multi-layer project (more than one top-level dir
  // or a mix of source / docs / config).
  const topDirs = topLevel.filter((p) => !p.includes('.')).length;
  if (topDirs >= 2) {
    functionality += 15;
    functionalitySignals.push(`${topDirs} top-level entries — multi-layer project`);
  }
  functionality = clamp(functionality, 0, 100);

  // --- stability ---------------------------------------------------------
  // For a code source, "stability" reduces to "did the
  // collector succeed and how clean are its logs?".
  const stability = clamp(100 - errorCount * 20 - warnCount * 4, 0, 100);
  const stabilityNote =
    errorCount === 0 && warnCount === 0
      ? 'No errors or warnings from the collector.'
      : `${errorCount} error${errorCount === 1 ? '' : 's'} and ${warnCount} warning${warnCount === 1 ? '' : 's'} from the collector.`;

  // --- performance -------------------------------------------------------
  // No Lighthouse for a code source. Use the file count and
  // tree depth as a soft proxy: very large trees hint at a
  // large surface that may need build-time performance work.
  let performance = 70;
  let performanceNote = 'No performance metrics in the evidence bundle.';
  if (hasMetrics(evidence) && metrics) {
    // Pull in any metric that exists, but never re-use the
    // browser-only Lighthouse keys for a code source.
    const candidates = [metrics.extra];
    for (const candidate of candidates) {
      if (candidate && typeof candidate['buildSeconds'] === 'number') {
        const seconds = candidate['buildSeconds'] as number;
        performance = clamp(Math.round(100 - Math.max(0, seconds - 30) * 2), 0, 100);
        performanceNote = `Build time: ${seconds}s.`;
      }
    }
    if (performanceNote === 'No performance metrics in the evidence bundle.') {
      performanceNote = 'No build/runtime metrics captured for this code source.';
    }
  }

  // --- accessibility -----------------------------------------------------
  // axe-core does not run on a code source. The accessibility
  // axis becomes "does the project signal any awareness of
  // accessibility?" — via a CI script, a doc page, or a
  // dedicated folder. We can only check the file tree for
  // hints, so the score is high by default and degrades
  // gracefully.
  let accessibilityScore = 85;
  let accessibilityNote =
    'No accessibility audit ran on this code source; a baseline 85 is awarded unless the file tree suggests awareness.';
  if (tree.length > 0) {
    const a11yHints = tree.filter((p) => /a11y|accessibility|wcag|aria/i.test(p));
    if (a11yHints.length > 0) {
      accessibilityScore = 90;
      accessibilityNote = `Project references accessibility in ${a11yHints.length} file path${a11yHints.length === 1 ? '' : 's'}.`;
    }
  }

  // --- error handling ----------------------------------------------------
  // For a code source, "error handling" is the engineering
  // signal: does the project have tests, a CI config, a
  // typecheck, or a linter? Each is a small positive.
  let errorHandling = 60;
  let errorHandlingNote = 'No engineering-quality signals in the project tree.';
  if (tree.length > 0) {
    const lower = tree.map((p) => p.toLowerCase());
    const hasTests = lower.some(
      (p) => /(^|\/)tests?\//.test(p) || /\.test\.[a-z]+$/.test(p) || /\.spec\.[a-z]+$/.test(p),
    );
    const hasCi = lower.some(
      (p) =>
        p.startsWith('.github/workflows/') ||
        p === '.gitlab-ci.yml' ||
        p === '.circleci/config.yml',
    );
    const hasLint = lower.some((p) =>
      /\.eslintrc|\.prettierrc|tsconfig\.json|biome\.json$/.test(p),
    );
    const hasTypecheck =
      lower.includes('tsconfig.json') ||
      lower.includes('pyrightconfig.json') ||
      lower.includes('mypy.ini');
    const signals: string[] = [];
    let bonus = 0;
    if (hasTests) {
      bonus += 15;
      signals.push('tests present');
    }
    if (hasCi) {
      bonus += 10;
      signals.push('CI config present');
    }
    if (hasLint) {
      bonus += 8;
      signals.push('linter / formatter configured');
    }
    if (hasTypecheck) {
      bonus += 7;
      signals.push('typecheck configured');
    }
    errorHandling = clamp(errorHandling + bonus, 0, 100);
    if (signals.length > 0) {
      errorHandlingNote = `${signals.join(', ')}.`;
    } else {
      errorHandlingNote = 'No tests, CI, linter, or typecheck config in the project tree.';
    }
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'functionality', score: functionality, note: functionalitySignals.join('; ') },
    { rubricId: 'stability', score: stability, note: stabilityNote },
    { rubricId: 'performance', score: performance, note: performanceNote },
    { rubricId: 'accessibility', score: accessibilityScore, note: accessibilityNote },
    { rubricId: 'error-handling', score: errorHandling, note: errorHandlingNote },
  ];

  const overall = round(
    functionality * 0.25 +
      stability * 0.2 +
      performance * 0.2 +
      accessibilityScore * 0.25 +
      errorHandling * 0.1,
  );

  let evidencePoints = 0;
  if (fileCount > 0) evidencePoints += 1;
  if (readme) evidencePoints += 1;
  if (license) evidencePoints += 1;
  if (evidence.metadata.facts.title || evidence.metadata.facts.description) evidencePoints += 1;
  if (logs.items.length > 0) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (fileCount === 0) {
    findings.push({
      title: 'No file tree in evidence',
      detail:
        'The bundle for this code source does not carry a file tree. The QA reviewer cannot confirm the project has any code.',
      category: 'functionality',
      confidence: 0.95,
    });
  }
  if (!readme || readmeLength === 0) {
    findings.push({
      title: 'No README',
      detail:
        'A missing or empty README means a new visitor (and a downstream reviewer) cannot tell what the project does or how to run it.',
      category: 'functionality',
      confidence: 0.9,
    });
  } else if (readmeLength < 200) {
    findings.push({
      title: 'README is very short',
      detail: `The README is only ${readmeLength} characters. Add at least a "What it is" and a "How to run" section.`,
      category: 'functionality',
      confidence: 0.8,
    });
  }
  if (!license) {
    findings.push({
      title: 'No license',
      detail:
        'A missing license is a known soft blocker for adoption. Pick one (MIT / Apache-2.0 are common defaults) and add a LICENSE file.',
      category: 'functionality',
      confidence: 0.8,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Collector errors detected',
      detail:
        `${errorCount} error-level log ${errorCount === 1 ? 'entry was' : 'entries were'} ` +
        'captured during the source-specific fetch. Treat each as a candidate broken step in the analysis pipeline.',
      category: 'stability',
      confidence: 0.9,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (functionality >= 80)
    strengths.push('Project shape looks complete (files + README + license).');
  if (stability >= 90) strengths.push('No errors or warnings from the collector.');
  if (errorHandling >= 80)
    strengths.push('Engineering signals present (tests, CI, linter, or typecheck).');
  if (readme && readmeLength >= 1000)
    strengths.push('README is substantial — likely explains the project end to end.');
  if (errorCount === 0 && warnCount === 0) strengths.push('Clean collector logs.');

  const weaknesses: string[] = [];
  if (fileCount === 0) weaknesses.push('No file tree in the evidence bundle.');
  if (!readme) weaknesses.push('No README — the project is undocumented.');
  if (!license) weaknesses.push('No LICENSE — adoption is gated.');
  if (errorCount > 0) {
    weaknesses.push(
      `${errorCount} collector error${errorCount === 1 ? '' : 's'} during evidence collection.`,
    );
  }

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!readme || readmeLength === 0) {
    priorityFixes.push({
      title: 'Add a README',
      description:
        'A README is the front door of a code project. Add at least a one-paragraph "What it is" and a "How to run" section.',
      effort: 'low',
      impact: 'high',
    });
  } else if (readmeLength < 200) {
    priorityFixes.push({
      title: 'Expand the README',
      description: `The README is only ${readmeLength} characters. Add a problem statement, install steps, and a usage example.`,
      effort: 'low',
      impact: 'medium',
    });
  }
  if (!license) {
    priorityFixes.push({
      title: 'Add a LICENSE file',
      description:
        'A missing license makes the project legally ambiguous for adopters. Add a LICENSE (MIT or Apache-2.0 are common defaults).',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve collector errors',
      description:
        'Each error-level log from the collector is a candidate broken step. Re-run the analyzer and confirm the logs are clean.',
      effort: 'medium',
      impact: 'high',
    });
  }
  // Flag a missing test directory.
  if (tree.length > 0) {
    const hasTests = tree.some(
      (p) => /(^|\/)tests?\//.test(p) || /\.test\.[a-z]+$/.test(p) || /\.spec\.[a-z]+$/.test(p),
    );
    if (!hasTests) {
      priorityFixes.push({
        title: 'Add a test suite',
        description:
          'No tests directory or test files were found in the project. A minimum smoke test is a strong quality signal.',
        effort: 'medium',
        impact: 'medium',
      });
    }
  }

  return {
    rubricScores,
    findings,
    strengths,
    weaknesses,
    priorityFixes,
    overall,
    confidence,
    source: evidence.metadata.source,
  };
};

/**
 * Source-aware top-level entry. Branches on `metadata.source`
 * and delegates to the browser or code analyzer. Filters
 * `priorityFixes` through the banned-token safety net for
 * code sources so a stale website-specific recommendation
 * can never slip in.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const source = evidence.metadata.source;
  const inner = isCodeSource(source) ? analyzeCode(evidence) : analyzeBrowser(evidence);
  if (!isCodeSource(source)) return inner;

  // Final safety net: drop any priority fix whose title or
  // description contains a banned browser-only token.
  const filteredFixes = inner.priorityFixes.filter(
    (fix) =>
      !containsBannedToken(fix.title, source) && !containsBannedToken(fix.description, source),
  );
  return { ...inner, priorityFixes: filteredFixes };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = sourceLabel(evidence.metadata.source);
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85 ? 'strong' : a.overall >= 70 ? 'solid' : a.overall >= 50 ? 'mixed' : 'weak';
  return (
    `QA review of ${source} "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const qaReviewer: Reviewer = {
  id: 'qa',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'qa') {
      return { ok: false, reason: `Expected reviewer 'qa', got '${output.reviewer}'.` };
    }
    if (output.score < 0 || output.score > 100) {
      return { ok: false, reason: `Score ${output.score} is outside 0–100.` };
    }
    if (output.confidence < 0 || output.confidence > 1) {
      return { ok: false, reason: `Confidence ${output.confidence} is outside 0–1.` };
    }
    if (output.schemaVersion !== 1) {
      return { ok: false, reason: `Unsupported schemaVersion ${output.schemaVersion}.` };
    }
    return { ok: true };
  },

  async run(ctx: ReviewerContext, _options?: ReviewerRunOptions): Promise<ReviewerOutput> {
    if (ctx.signal?.aborted) {
      const err: ReviewerError = {
        reviewer: 'qa',
        kind: 'aborted',
        message: 'QA reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'qa',
      score: analysis.overall,
      confidence: analysis.confidence,
      summary: summarize(analysis, ctx.evidence),
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      priorityFixes: analysis.priorityFixes,
      rubricScores: analysis.rubricScores,
      findings: analysis.findings,
      schemaVersion: 1,
    };

    // `validate` is optional on the contract, so look it up
    // defensively. The QA reviewer always provides one; this
    // null-check exists to satisfy the optional-field type.
    const validate = qaReviewer.validate;
    if (!validate) {
      throw new Error('QA reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'qa',
        kind: 'parse-error',
        message: validation.reason,
        retriable: false,
      };
      throw new Error(err.message);
    }

    return output;
  },
};

/* -------------------------------------------------------------------------- */
/* Module surface                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Backwards-compatible function entry point. Delegates to
 * `qaReviewer.run()` and is what the reviewer registry will
 * call when it dispatches the QA juror on a session.
 */
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return qaReviewer.run(ctx, options);
}

/**
 * `ReviewerFactory` for dependency injection. The current
 * implementation takes no dependencies; the signature exists
 * so a future LLM-backed variant can be slotted in without
 * changing the import surface (`createQaReviewer(deps)`).
 */
export const createQaReviewer: ReviewerFactory = (_deps) => qaReviewer;

/**
 * The `Reviewer` object itself, exported for tests and for
 * registries that prefer object-style registration over the
 * default module export.
 */
export { qaReviewer };

const qaModule: ReviewerModule = {
  reviewer: qaReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default qaModule;
