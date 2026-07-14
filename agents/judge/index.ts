/**
 * agents/judge — Hackathon Judge reviewer
 *
 * Task 6.8 — Real implementation. Source-aware (Task 3.4).
 *
 * Scores the product as if it were a hackathon submission.
 * The judge is biased toward the 30-second wow factor,
 * demo-ability, technical ambition, polish relative to time
 * spent, and novelty of the idea.
 *
 * Source-aware behavior (Task 3.4)
 *  - The "30-second wow" axis is meaningful for a browser
 *    source (a hero, a first paint) and meaningless for a
 *    code source (a repo has no hero). For code sources
 *    the axis becomes "is the README front-and-center?".
 *  - The "demo-ability" axis maps to "headline + body + link
 *    triangle" for browser sources and "README + install +
 *    usage" for code sources.
 *  - The "ambition" axis is the same on both sources — it
 *    scores the project shape (file tree, README, license,
 *    multi-layer project).
 *  - The "polish" axis leans on accessibility and
 *    performance for browser sources and on engineering
 *    signals (tests, CI, linter, typecheck) for code sources.
 *  - The "novelty" axis looks for action-verb framing,
 *    specific-audience phrasing, and a non-trivial tech
 *    stack.
 *  - The summary uses a human-readable source label
 *    ("Hackathon judge review of GitHub repository ...")
 *    rather than the raw "github" / "zip" id.
 *  - All `priorityFixes` are passed through the banned-token
 *    safety net so a "Make the hero pop" or "Tighten the
 *    demo triangle" recommendation can never appear in a
 *    code-source run.
 *
 * Public surface (matches `ReviewerModule` in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`            — `'judge'`.
 *   - `judgeReviewer`          — the `Reviewer` object.
 *   - `runReviewer`            — legacy function entry point.
 *   - `createJudgeReviewer`    — `ReviewerFactory` for DI.
 *   - `default`                — the `ReviewerModule`.
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

export const REVIEWER_ID = 'judge' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'judge',
  role: REVIEWER_ROLES.judge,
  description:
    'Scores the product as a hackathon submission. Weights the 30-second wow factor, demo-ability, technical ambition, polish, and novelty of the idea.',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'wow',
    label: '30-second wow factor',
    description: 'Does the hero / first paint pop?',
    weight: 0.25,
  },
  {
    id: 'demo-ability',
    label: 'Demo-ability',
    description: 'Can a stranger grasp the product in one screen?',
    weight: 0.2,
  },
  {
    id: 'ambition',
    label: 'Technical ambition',
    description: 'Is there real technical depth under the hood?',
    weight: 0.2,
  },
  {
    id: 'polish',
    label: 'Polish',
    description: 'Is the surface clean for the time spent?',
    weight: 0.15,
  },
  {
    id: 'novelty',
    label: 'Novelty',
    description: 'Is the idea more than another CRUD app?',
    weight: 0.2,
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
 * Browser-source judge analysis. The 30-second wow factor
 * leans on a hero screenshot, a confident headline, an OG
 * image, and substantial above-the-fold copy. The
 * demo-ability axis is the headline + body + link triangle
 * plus a CTA-style link.
 */
const analyzeBrowser = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, files, metrics, metadata, logs } = evidence;
  const pageContent = hasPageContent(evidence) ? evidence.pageContent : undefined;

  // --- wow factor --------------------------------------------------------
  let wow = 30;
  const wowSignals: string[] = [];
  if (hasScreenshots(evidence)) {
    wow += 25;
    wowSignals.push('hero / first-paint visual captured');
  } else {
    wowSignals.push('no screenshots — wow cannot be evaluated');
  }
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    wow += 25;
    wowSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    wowSignals.push('no headline — hero is mute');
  }
  if (metadata.facts.imageUrl) {
    wow += 10;
    wowSignals.push('OG image present — sharing previews will look branded');
  }
  if (pageContent && pageContent.body.length > 80) {
    wow += 10;
    wowSignals.push('substantial above-the-fold copy');
  }
  wow = clamp(wow, 0, 100);

  // --- demo-ability ------------------------------------------------------
  let demo = 25;
  const demoSignals: string[] = [];
  if (pageContent) {
    const triangleOk =
      pageContent.headings.length > 0 &&
      pageContent.body.length > 0 &&
      pageContent.links.length > 0;
    if (triangleOk) {
      demo += 40;
      demoSignals.push('headline + body + link triangle is complete');
    } else {
      const missing: string[] = [];
      if (pageContent.headings.length === 0) missing.push('headline');
      if (pageContent.body.length === 0) missing.push('body');
      if (pageContent.links.length === 0) missing.push('link');
      demoSignals.push(`demo triangle missing: ${missing.join(', ')}`);
    }
    if (pageContent.body.length > 0 && pageContent.body.length < 200) {
      demo += 10;
      demoSignals.push('body copy is concise — easy to scan');
    } else if (pageContent.body.length >= 200) {
      demo += 5;
      demoSignals.push('body copy is long — demo-ability suffers');
    }
    let ctaCount = 0;
    for (const link of pageContent.links) {
      const t = link.text.trim().toLowerCase();
      if (
        t.startsWith('get ') ||
        t.startsWith('sign ') ||
        t.startsWith('try ') ||
        t.startsWith('start ') ||
        t.startsWith('book ') ||
        t.startsWith('demo') ||
        t.startsWith('launch')
      ) {
        ctaCount += 1;
      }
    }
    if (ctaCount >= 1) {
      demo += 20;
      demoSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'}`);
    }
  } else {
    demoSignals.push('no page content to evaluate demo-ability');
  }
  demo = clamp(demo, 0, 100);

  // --- technical ambition ------------------------------------------------
  let ambition = 30;
  const ambitionSignals: string[] = [];
  if (hasFiles(evidence)) {
    if (evidence.files.fileTree.length > 0) {
      ambition += 15;
      ambitionSignals.push(
        `${evidence.files.fileTree.length} file${evidence.files.fileTree.length === 1 ? '' : 's'} in tree`,
      );
    }
    if (evidence.files.readme && evidence.files.readme.length > 0) {
      ambition += 15;
      ambitionSignals.push('README present — engineering footprint visible');
    }
    if (evidence.files.license) {
      ambition += 5;
      ambitionSignals.push('license present — distribution intent is real');
    }
    const exts = new Set(
      evidence.files.fileTree
        .map((p) => {
          const m = p.match(/\.([a-z0-9]+)$/i);
          return m && m[1] ? m[1].toLowerCase() : '';
        })
        .filter((s): s is string => s.length > 0),
    );
    if (exts.size >= 3) {
      ambition += 15;
      ambitionSignals.push(
        `${exts.size} file extensions — multi-layer project (${Array.from(exts).slice(0, 5).join(', ')})`,
      );
    } else if (exts.size >= 1) {
      ambition += 5;
      ambitionSignals.push(`${exts.size} file extension${exts.size === 1 ? '' : 's'}`);
    }
  } else {
    ambitionSignals.push('no file tree — technical ambition cannot be evaluated');
  }
  if (metadata.facts.language && metadata.facts.language.length > 0) {
    ambition += 10;
    ambitionSignals.push(`language hint: ${metadata.facts.language}`);
  }
  ambition = clamp(ambition, 0, 100);

  // --- polish ------------------------------------------------------------
  let polish = 70;
  const polishSignals: string[] = ['baseline polish from a structured surface'];
  if (hasAccessibility(evidence)) {
    const a = evidence.accessibility.summary;
    polish = clamp(100 - a.critical * 18 - a.serious * 8 - a.moderate * 4 - a.minor * 2, 0, 100);
    polishSignals[0] = `accessibility: ${a.critical}C/${a.serious}S/${a.moderate}M/${a.minor}m`;
  }
  if (metrics?.performance !== undefined) {
    polish = clamp(Math.round((polish + metrics.performance) / 2), 0, 100);
    polishSignals.push(`Lighthouse performance: ${metrics.performance}/100`);
  }
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  const warnCount = logs.items.filter((l) => l.level === 'warn').length;
  if (errorCount > 0) {
    polish = clamp(polish - errorCount * 8, 0, 100);
    polishSignals.push(`${errorCount} runtime error${errorCount === 1 ? '' : 's'} damage polish`);
  }
  if (warnCount > 0) {
    polish = clamp(polish - warnCount * 2, 0, 100);
    polishSignals.push(`${warnCount} runtime warning${warnCount === 1 ? '' : 's'}`);
  }
  polish = clamp(polish, 0, 100);

  // --- novelty -----------------------------------------------------------
  let novelty = 50;
  const noveltySignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const specificAudience =
      /\bfor (developers|designers|founders|creators|marketers|agencies|teams|smb|enterprise|students)\b/.test(
        haystack,
      );
    if (specificAudience) {
      novelty += 15;
      noveltySignals.push('specific audience phrase detected');
    }
    const actionVerb =
      /\b(automate|orchestrate|generate|transform|repurpose|reimagine|rewrite|co-pilot|co-create|curate)\b/.test(
        haystack,
      );
    if (actionVerb) {
      novelty += 15;
      noveltySignals.push('action-verb framing detected — likely not CRUD');
    }
  }
  if (hasFiles(evidence) && evidence.files.readme) {
    if (evidence.files.readme.length > 2000) {
      novelty += 10;
      noveltySignals.push('README is substantial — likely a real artifact, not a starter template');
    } else if (evidence.files.readme.length > 500) {
      novelty += 5;
      noveltySignals.push('README is reasonable length');
    }
  }
  if (hasFiles(evidence)) {
    const exts = new Set(
      evidence.files.fileTree
        .map((p) => {
          const m = p.match(/\.([a-z0-9]+)$/i);
          return m && m[1] ? m[1].toLowerCase() : '';
        })
        .filter((s): s is string => s.length > 0),
    );
    if (
      exts.has('rs') ||
      exts.has('go') ||
      exts.has('py') ||
      exts.has('ml') ||
      exts.has('ex') ||
      exts.has('exs')
    ) {
      novelty += 10;
      noveltySignals.push('less common tech-stack signal in the tree');
    }
  }
  novelty = clamp(novelty, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'wow', score: wow, note: wowSignals.join('; ') },
    { rubricId: 'demo-ability', score: demo, note: demoSignals.join('; ') },
    { rubricId: 'ambition', score: ambition, note: ambitionSignals.join('; ') },
    { rubricId: 'polish', score: polish, note: polishSignals.join('; ') },
    { rubricId: 'novelty', score: novelty, note: noveltySignals.join('; ') },
  ];

  const overall = round(wow * 0.25 + demo * 0.2 + ambition * 0.2 + polish * 0.15 + novelty * 0.2);

  let evidencePoints = 0;
  if (hasScreenshots(evidence)) evidencePoints += 1;
  if (hasPageContent(evidence)) evidencePoints += 1;
  if (hasFiles(evidence)) evidencePoints += 1;
  if (hasAccessibility(evidence) || hasMetrics(evidence)) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (wow < 60) {
    findings.push({
      title: 'Weak wow factor',
      detail:
        'The 30-second wow factor is the single biggest lever for a hackathon submission. A muted hero loses judges fast.',
      category: 'wow',
      confidence: 0.9,
    });
  }
  if (demo < 60) {
    findings.push({
      title: 'Demo is not obvious in one screen',
      detail:
        'Headline / body / link triangle is incomplete. A judge watching the demo for 60 seconds needs to grasp the product immediately.',
      category: 'demo-ability',
      confidence: 0.85,
    });
  }
  if (ambition < 50) {
    findings.push({
      title: 'Technical ambition is hard to see',
      detail:
        'No README, no license, no file-tree signal. The judge cannot tell that there is depth under the hood.',
      category: 'ambition',
      confidence: 0.8,
    });
  }
  if (novelty < 50) {
    findings.push({
      title: 'Hard to tell this is not "another CRUD app"',
      detail:
        'No specific audience, no action-verb framing, no README signal. The novelty lever is not being pulled.',
      category: 'novelty',
      confidence: 0.7,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Runtime errors visible',
      detail: `${errorCount} error${errorCount === 1 ? '' : 's'} in the runtime logs. The demo will visibly break.`,
      category: 'polish',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (wow >= 80) strengths.push('Hero / first paint pops.');
  if (demo >= 80) strengths.push('Demo is graspable in one screen.');
  if (ambition >= 75)
    strengths.push('Technical depth is visible (README, file tree, multi-layer project).');
  if (novelty >= 70) strengths.push('Idea reads as more than a CRUD app.');
  if (polish >= 85) strengths.push('Surface is clean for the time spent.');

  const weaknesses: string[] = [];
  if (wow < 60) weaknesses.push('Wow factor is muted.');
  if (demo < 60) weaknesses.push('Demo is not obvious in one screen.');
  if (ambition < 50) weaknesses.push('Technical ambition is hard to see.');
  if (errorCount > 0)
    weaknesses.push(
      `${errorCount} runtime error${errorCount === 1 ? '' : 's'} visible in the demo.`,
    );

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (wow < 70) {
    priorityFixes.push({
      title: 'Make the hero pop',
      description:
        'Add a confident headline, a strong visual, or a single one-line value prop. The 30-second wow is the biggest lever.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (demo < 70) {
    priorityFixes.push({
      title: 'Tighten the demo triangle',
      description:
        'Make sure the hero screen shows: what it is (headline), why it matters (body), what to do next (CTA link).',
      effort: 'low',
      impact: 'high',
    });
  }
  if (ambition < 60 && (!files || !files.readme)) {
    priorityFixes.push({
      title: 'Surface the technical depth',
      description:
        'Add a README that explains the architecture, the data model, or the interesting technical decisions. Judges reward depth.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (novelty < 60) {
    priorityFixes.push({
      title: 'Pull the novelty lever',
      description:
        'Name the specific audience in plain language and frame the action as a verb. Avoid generic positioning.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve runtime errors before the demo',
      description:
        'Any visible runtime error is a guaranteed deduction. Triage and fix before the live demo.',
      effort: 'medium',
      impact: 'high',
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
 * Code-source judge analysis. The "wow" axis becomes "is the
 * README front-and-center and does the project feel like a
 * real artifact?". The "demo-ability" axis becomes "can a
 * stranger install + run it from the README alone?".
 * "Ambition" and "novelty" are largely the same; "polish"
 * is the engineering-signals axis (tests, CI, linter,
 * typecheck) instead of accessibility / Lighthouse.
 */
const analyzeCode = (evidence: EvidenceBundle): Analysis => {
  const { metadata, logs } = evidence;
  const files = hasFiles(evidence) ? evidence.files : undefined;
  const readme = files?.readme;
  const fileTree = files?.fileTree ?? [];
  const readmeLength = readme?.length ?? 0;

  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  const warnCount = logs.items.filter((l) => l.level === 'warn').length;

  // --- wow factor --------------------------------------------------------
  // For a code source, "wow" = "is the README front-and-center
  // and substantial, with a clear problem statement?".
  let wow = 30;
  const wowSignals: string[] = [];
  if (readme && readmeLength > 0) {
    if (readmeLength >= 1500) {
      wow += 40;
      wowSignals.push(`README is substantial (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 500) {
      wow += 25;
      wowSignals.push(`README is reasonable (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 200) {
      wow += 15;
      wowSignals.push(`README is short (${readmeLength.toLocaleString()} chars)`);
    } else {
      wow += 5;
      wowSignals.push(`README is very short (${readmeLength.toLocaleString()} chars)`);
    }
  } else {
    wowSignals.push('no README — the project is mute');
  }
  if (metadata.facts.imageUrl) {
    wow += 15;
    wowSignals.push('social-preview image present');
  }
  if (evidence.metadata.facts.description) {
    wow += 15;
    wowSignals.push('project description present');
  }
  wow = clamp(wow, 0, 100);

  // --- demo-ability ------------------------------------------------------
  // For a code source, "demo-ability" = "can a stranger
  // install + run this from the README alone?".
  let demo = 25;
  const demoSignals: string[] = [];
  if (readme) {
    const lower = readme.toLowerCase();
    const hasInstallCmd =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/.test(
        lower,
      );
    const hasQuickStart =
      /\b(quick start|getting started|installation|install|usage|how to run|run locally)\b/.test(
        lower,
      );
    if (hasInstallCmd) {
      demo += 35;
      demoSignals.push('install command visible in the README');
    } else {
      demoSignals.push('no install command in the README');
    }
    if (hasQuickStart) {
      demo += 20;
      demoSignals.push('Quick Start / Getting Started section present');
    }
    const headingCount = (readme.match(/^#{1,6}\s+/gm) ?? []).length;
    if (headingCount >= 5) {
      demo += 15;
      demoSignals.push(`README has ${headingCount} headings — strong scannability`);
    } else if (headingCount >= 2) {
      demo += 8;
      demoSignals.push(`README has ${headingCount} headings`);
    }
  } else {
    demoSignals.push('no README — onboarding is invisible');
  }
  if (evidence.metrics?.stars !== undefined && evidence.metrics.stars >= 10) {
    demo = clamp(demo + 5, 0, 100);
    demoSignals.push(`star count suggests prior installs (${evidence.metrics.stars})`);
  }
  demo = clamp(demo, 0, 100);

  // --- technical ambition ------------------------------------------------
  let ambition = 30;
  const ambitionSignals: string[] = [];
  if (fileTree.length > 0) {
    ambition += 15;
    ambitionSignals.push(`${fileTree.length} file${fileTree.length === 1 ? '' : 's'} in tree`);
  }
  if (readme && readmeLength > 0) {
    ambition += 15;
    ambitionSignals.push('README present — engineering footprint visible');
  }
  if (files?.license) {
    ambition += 5;
    ambitionSignals.push('license present — distribution intent is real');
  }
  const exts = new Set(
    fileTree
      .map((p) => {
        const m = p.match(/\.([a-z0-9]+)$/i);
        return m && m[1] ? m[1].toLowerCase() : '';
      })
      .filter((s): s is string => s.length > 0),
  );
  if (exts.size >= 3) {
    ambition += 15;
    ambitionSignals.push(
      `${exts.size} file extensions — multi-layer project (${Array.from(exts).slice(0, 5).join(', ')})`,
    );
  } else if (exts.size >= 1) {
    ambition += 5;
    ambitionSignals.push(`${exts.size} file extension${exts.size === 1 ? '' : 's'}`);
  }
  if (metadata.facts.language && metadata.facts.language.length > 0) {
    ambition += 10;
    ambitionSignals.push(`language hint: ${metadata.facts.language}`);
  }
  ambition = clamp(ambition, 0, 100);

  // --- polish ------------------------------------------------------------
  // Code-source polish is engineering signals: tests, CI,
  // linter, typecheck.
  let polish = 60;
  const polishSignals: string[] = ['baseline polish from a structured project'];
  if (fileTree.length > 0) {
    const lower = fileTree.map((p) => p.toLowerCase());
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
      bonus += 18;
      signals.push('tests present');
    }
    if (hasCi) {
      bonus += 12;
      signals.push('CI config present');
    }
    if (hasLint) {
      bonus += 10;
      signals.push('linter / formatter configured');
    }
    if (hasTypecheck) {
      bonus += 8;
      signals.push('typecheck configured');
    }
    polish = clamp(polish + bonus, 0, 100);
    if (signals.length > 0) {
      polishSignals[0] = signals.join(', ') + '.';
    } else {
      polishSignals[0] = 'No tests / CI / linter / typecheck in the project tree.';
    }
  }
  if (errorCount > 0) {
    polish = clamp(polish - errorCount * 8, 0, 100);
    polishSignals.push(`${errorCount} collector error${errorCount === 1 ? '' : 's'} damage polish`);
  }
  if (warnCount > 0) {
    polish = clamp(polish - warnCount * 2, 0, 100);
    polishSignals.push(`${warnCount} collector warning${warnCount === 1 ? '' : 's'}`);
  }
  polish = clamp(polish, 0, 100);

  // --- novelty -----------------------------------------------------------
  let novelty = 50;
  const noveltySignals: string[] = [];
  if (readme) {
    const haystack = readme.toLowerCase();
    const specificAudience =
      /\bfor (developers|designers|founders|creators|marketers|agencies|teams|smb|enterprise|students)\b/.test(
        haystack,
      );
    if (specificAudience) {
      novelty += 15;
      noveltySignals.push('specific audience phrase detected');
    }
    const actionVerb =
      /\b(automate|orchestrate|generate|transform|repurpose|reimagine|rewrite|co-pilot|co-create|curate)\b/.test(
        haystack,
      );
    if (actionVerb) {
      novelty += 15;
      noveltySignals.push('action-verb framing detected — likely not CRUD');
    }
    if (readme.length > 2000) {
      novelty += 10;
      noveltySignals.push('README is substantial — likely a real artifact, not a starter template');
    } else if (readme.length > 500) {
      novelty += 5;
      noveltySignals.push('README is reasonable length');
    }
  }
  if (
    exts.has('rs') ||
    exts.has('go') ||
    exts.has('py') ||
    exts.has('ml') ||
    exts.has('ex') ||
    exts.has('exs')
  ) {
    novelty += 10;
    noveltySignals.push('less common tech-stack signal in the tree');
  }
  novelty = clamp(novelty, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'wow', score: wow, note: wowSignals.join('; ') },
    { rubricId: 'demo-ability', score: demo, note: demoSignals.join('; ') },
    { rubricId: 'ambition', score: ambition, note: ambitionSignals.join('; ') },
    { rubricId: 'polish', score: polish, note: polishSignals.join('; ') },
    { rubricId: 'novelty', score: novelty, note: noveltySignals.join('; ') },
  ];

  const overall = round(wow * 0.25 + demo * 0.2 + ambition * 0.2 + polish * 0.15 + novelty * 0.2);

  let evidencePoints = 0;
  if (fileTree.length > 0) evidencePoints += 1;
  if (readme) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  if (evidence.metrics?.stars !== undefined) evidencePoints += 1;
  if (files?.license) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (wow < 60) {
    findings.push({
      title: 'Weak first impression',
      detail:
        'The README is the front door of a code project. A short or empty README loses judges in the first 30 seconds.',
      category: 'wow',
      confidence: 0.9,
    });
  }
  if (demo < 60) {
    findings.push({
      title: 'Onboarding is not obvious',
      detail:
        'A judge cannot install + run the project from the README alone. Add a Quick start with the install command.',
      category: 'demo-ability',
      confidence: 0.85,
    });
  }
  if (ambition < 50) {
    findings.push({
      title: 'Technical ambition is hard to see',
      detail:
        'No README, no license, no file-tree signal. The judge cannot tell that there is depth under the hood.',
      category: 'ambition',
      confidence: 0.8,
    });
  }
  if (novelty < 50) {
    findings.push({
      title: 'Hard to tell this is not "another CRUD app"',
      detail:
        'No specific audience, no action-verb framing, no README signal. The novelty lever is not being pulled.',
      category: 'novelty',
      confidence: 0.7,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Collector errors detected',
      detail: `${errorCount} error${errorCount === 1 ? '' : 's'} in the collector logs. The analysis step did not complete cleanly.`,
      category: 'polish',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (wow >= 80) strengths.push('README is substantial and front-and-center.');
  if (demo >= 80) strengths.push('A stranger can install + run from the README alone.');
  if (ambition >= 75)
    strengths.push('Technical depth is visible (README, file tree, multi-layer project).');
  if (novelty >= 70) strengths.push('Idea reads as more than a CRUD app.');
  if (polish >= 85) strengths.push('Engineering signals are present (tests, CI, linter).');

  const weaknesses: string[] = [];
  if (wow < 60) weaknesses.push('First impression is muted (thin or no README).');
  if (demo < 60) weaknesses.push('Onboarding is not obvious from the README.');
  if (ambition < 50) weaknesses.push('Technical ambition is hard to see.');
  if (errorCount > 0)
    weaknesses.push(`${errorCount} collector error${errorCount === 1 ? '' : 's'} visible.`);

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (wow < 70) {
    priorityFixes.push({
      title: 'Make the README front-and-center',
      description:
        'A code project is judged by its README. Add a confident problem statement, a 1-line value prop, and a "Who is it for" line.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (demo < 70) {
    priorityFixes.push({
      title: 'Add a Quick start to the README',
      description:
        'Make sure the README shows: what it is (problem statement), why it matters (value prop), how to run (install + minimal example).',
      effort: 'low',
      impact: 'high',
    });
  }
  if (ambition < 60 && (!readme || readmeLength === 0)) {
    priorityFixes.push({
      title: 'Surface the technical depth',
      description:
        'Add a README that explains the architecture, the data model, or the interesting technical decisions. Judges reward depth.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (novelty < 60) {
    priorityFixes.push({
      title: 'Pull the novelty lever',
      description:
        'Name the specific audience in plain language and frame the action as a verb. Avoid generic positioning.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (fileTree.length > 0) {
    const lower = fileTree.map((p) => p.toLowerCase());
    const hasTests = lower.some(
      (p) => /(^|\/)tests?\//.test(p) || /\.test\.[a-z]+$/.test(p) || /\.spec\.[a-z]+$/.test(p),
    );
    if (!hasTests) {
      priorityFixes.push({
        title: 'Add a test suite',
        description:
          'No tests directory or test files in the project. A minimum smoke test is a strong polish signal for a hackathon submission.',
        effort: 'medium',
        impact: 'medium',
      });
    }
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve collector errors before the demo',
      description:
        'Any visible collector error is a guaranteed deduction. Re-run the analyzer and confirm the logs are clean.',
      effort: 'medium',
      impact: 'high',
    });
  }

  const source = evidence.metadata.source;

  // Final safety net: drop any priority fix whose title or
  // description contains a banned browser-only token. The
  // code-source analysis is already framed for a repo, but
  // the filter is the belt-and-braces guarantee that
  // something like "Make the hero pop" can never slip in.
  const filteredFixes = isCodeSource(source)
    ? priorityFixes.filter(
        (fix) =>
          !containsBannedToken(fix.title, source) && !containsBannedToken(fix.description, source),
      )
    : priorityFixes;
  const filteredFindings = isCodeSource(source)
    ? findings.filter(
        (f) => !containsBannedToken(f.title, source) && !containsBannedToken(f.detail, source),
      )
    : findings;

  return {
    rubricScores,
    findings: filteredFindings,
    strengths,
    weaknesses,
    priorityFixes: filteredFixes,
    overall,
    confidence,
    source,
  };
};

/**
 * Source-aware top-level entry. Branches on `metadata.source`
 * and delegates to the browser or code analyzer.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const source = evidence.metadata.source;
  return isCodeSource(source) ? analyzeCode(evidence) : analyzeBrowser(evidence);
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = sourceLabel(evidence.metadata.source);
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85
      ? 'podium-worthy'
      : a.overall >= 70
        ? 'demo-ready'
        : a.overall >= 50
          ? 'rough cut'
          : 'not ready';
  return (
    `Hackathon judge review of ${source} "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const judgeReviewer: Reviewer = {
  id: 'judge',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'judge') {
      return { ok: false, reason: `Expected reviewer 'judge', got '${output.reviewer}'.` };
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
        reviewer: 'judge',
        kind: 'aborted',
        message: 'Judge reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'judge',
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

    const validate = judgeReviewer.validate;
    if (!validate) {
      throw new Error('Judge reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'judge',
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

export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return judgeReviewer.run(ctx, options);
}

export const createJudgeReviewer: ReviewerFactory = (_deps) => judgeReviewer;

export { judgeReviewer };

const judgeModule: ReviewerModule = {
  reviewer: judgeReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default judgeModule;
