/**
 * agents/qa — QA Engineer reviewer
 *
 * Task 6.3.3 — Real implementation.
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
import type { EvidenceBundle } from '@/types/evidence';

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
};

/**
 * Score a single `EvidenceBundle` against the five QA rubric
 * axes and roll the per-axis scores up into an overall score,
 * confidence, findings, strengths, weaknesses, and priority
 * fixes.
 *
 * The function is pure: it reads only the bundle, has no
 * external state, and returns the same shape for the same
 * input. The deterministic nature is intentional — it keeps
 * the reviewer testable without an LLM and lets the future
 * LLM-backed variant be a drop-in replacement via the same
 * `Reviewer` contract.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, pageContent, files, logs, accessibility, metrics } = evidence;

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
  if (pageContent && pageContent.body.length > 0) {
    functionality += 40;
    functionalitySignals.push(
      `page content present (${pageContent.headings.length} heading${pageContent.headings.length === 1 ? '' : 's'}, ` +
        `${pageContent.body.length} chars)`,
    );
  } else if (files && files.fileTree.length > 0) {
    functionality += 30;
    functionalitySignals.push(
      `${files.fileTree.length} file${files.fileTree.length === 1 ? '' : 's'} in the project tree`,
    );
  } else {
    functionalitySignals.push('no content evidence (page content or file tree)');
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
  if (accessibility) {
    const a = accessibility.summary;
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

  // --- confidence --------------------------------------------------------
  // More sections of the bundle that are populated → more confidence
  // the verdict reflects reality. Caps at 0.85 because the current
  // implementation is deterministic and does not use an LLM.
  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (files && files.fileTree.length > 0) evidencePoints += 1;
  if (accessibility) evidencePoints += 1;
  if (metrics && metrics.performance !== undefined) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (accessibility) {
    const a = accessibility.summary;
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
  if (screenshots.items.length === 0 && (!pageContent || pageContent.body.length === 0)) {
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
  if (accessibility && accessibilityScore >= 90) {
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
  if (accessibility && accessibility.summary.critical > 0) {
    weaknesses.push(
      `${accessibility.summary.critical} critical accessibility violation${accessibility.summary.critical === 1 ? '' : 's'}.`,
    );
  }
  if (metrics?.performance !== undefined && performance < 70) {
    weaknesses.push(`Lighthouse performance score is ${performance}/100.`);
  }
  if (screenshots.items.length === 0) {
    weaknesses.push('No visual evidence (screenshots) was collected.');
  }

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (accessibility && accessibility.summary.critical > 0) {
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
  };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = evidence.metadata.source;
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85 ? 'strong' : a.overall >= 70 ? 'solid' : a.overall >= 50 ? 'mixed' : 'weak';
  return (
    `QA review of ${source} target "${target}" is ${level} ` +
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
