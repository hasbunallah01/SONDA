/**
 * agents/ux — UX Designer reviewer
 *
 * Task 6.4 — Real implementation.
 *
 * Decides whether the product is usable, clear, and visually
 * crafted. Looks at the evidence bundle for the signals we can
 * extract deterministically — page content, screenshots count,
 * accessibility findings, file structure — and turns them into
 * a per-axis score, a list of findings, and prioritized fixes.
 *
 * Like the QA reviewer, the current implementation is
 * **deterministic**: it does not call an LLM. A future task can
 * drop in an LLM-backed variant via the `ReviewerFactory`
 * (`createUxReviewer`) without changing this module's public
 * surface.
 *
 * Public surface (matches the `ReviewerModule` shape in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`       — the `ReviewerId` literal `'ux'`.
 *   - `uxReviewer`        — the object-shaped `Reviewer`.
 *   - `runReviewer`       — legacy function entry point that
 *                           delegates to `uxReviewer.run()`.
 *   - `createUxReviewer`  — `ReviewerFactory` for DI of future
 *                           LLM clients.
 *   - `default`           — the `ReviewerModule` the orchestrator
 *                           consumes at registration time.
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

export const REVIEWER_ID = 'ux' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'ux',
  role: REVIEWER_ROLES.ux,
  description:
    'Decides whether the product is usable, clear, and visually crafted. Scores clarity of value proposition, visual hierarchy, primary-action usability, cross-surface consistency, and overall craft.',
  defaultWeight: 0.2,
};

const rubric: ReviewerRubric = [
  {
    id: 'clarity',
    label: 'Clarity of value proposition',
    description: 'Is the headline, subhead, and body copy immediately understandable?',
    weight: 0.25,
  },
  {
    id: 'hierarchy',
    label: 'Visual hierarchy',
    description: 'Are headings, body, and CTAs structured so the user knows where to look?',
    weight: 0.2,
  },
  {
    id: 'usability',
    label: 'Primary-action usability',
    description: 'Is the main call-to-action obvious and reachable in one click?',
    weight: 0.2,
  },
  {
    id: 'consistency',
    label: 'Cross-surface consistency',
    description: 'Do desktop and mobile / page-to-page surfaces feel coherent?',
    weight: 0.15,
  },
  {
    id: 'craft',
    label: 'Craft & polish',
    description: 'Typography, spacing, accessibility, and overall finish.',
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
};

/**
 * Score a single `EvidenceBundle` against the five UX rubric
 * axes and roll the per-axis scores up into an overall score,
 * confidence, findings, strengths, weaknesses, and priority
 * fixes.
 *
 * The function is pure: it reads only the bundle, has no
 * external state, and returns the same shape for the same
 * input.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, pageContent, accessibility, metrics } = evidence;

  // --- clarity -----------------------------------------------------------
  // Headline + body copy presence, length, and density.
  let clarity = 30;
  const claritySignals: string[] = [];
  if (pageContent && pageContent.body.length > 0) {
    const body = pageContent.body;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 30) {
      clarity += 40;
      claritySignals.push(`${wordCount} words of body copy present`);
    } else if (wordCount > 0) {
      clarity += 20;
      claritySignals.push(`only ${wordCount} word${wordCount === 1 ? '' : 's'} of body copy`);
    } else {
      claritySignals.push('no body copy');
    }
  } else {
    claritySignals.push('no page content in evidence');
  }
  if (pageContent && pageContent.headings.length > 0) {
    clarity += 30;
    claritySignals.push(
      `${pageContent.headings.length} heading${pageContent.headings.length === 1 ? '' : 's'}`,
    );
  } else {
    claritySignals.push('no headings');
  }
  clarity = clamp(clarity, 0, 100);

  // --- hierarchy ---------------------------------------------------------
  // Hierarchical structure: how many headings vs body chars.
  let hierarchy = 40;
  const hierarchySignals: string[] = [];
  if (pageContent && pageContent.headings.length > 0) {
    hierarchy += 30;
    if (pageContent.headings.length >= 3) {
      hierarchy += 30;
      hierarchySignals.push(`${pageContent.headings.length} headings — substantial hierarchy`);
    } else {
      hierarchySignals.push(
        `only ${pageContent.headings.length} heading${pageContent.headings.length === 1 ? '' : 's'}`,
      );
    }
  } else {
    hierarchySignals.push('no headings to structure the page');
  }
  hierarchy = clamp(hierarchy, 0, 100);

  // --- usability ---------------------------------------------------------
  // Primary action usability: presence of links, screenshots for context.
  let usability = 40;
  const usabilitySignals: string[] = [];
  if (pageContent && pageContent.links.length > 0) {
    usability += 30;
    if (pageContent.links.length >= 3) {
      usability += 30;
      usabilitySignals.push(
        `${pageContent.links.length} link${pageContent.links.length === 1 ? '' : 's'} — clear navigation`,
      );
    } else {
      usability += 10;
      usabilitySignals.push(
        `only ${pageContent.links.length} link${pageContent.links.length === 1 ? '' : 's'}`,
      );
    }
  } else {
    usabilitySignals.push('no links in page content');
  }
  if (screenshots.items.length >= 1) {
    usability = clamp(usability + 0, 0, 100); // already counted; no-op
    usabilitySignals.push(
      `${screenshots.items.length} screenshot${screenshots.items.length === 1 ? '' : 's'} captured`,
    );
  } else {
    usabilitySignals.push('no screenshots captured — primary action cannot be visually verified');
  }
  usability = clamp(usability, 0, 100);

  // --- consistency -------------------------------------------------------
  // Cross-surface consistency: at least 2 screenshots, or at least 1 + page content.
  let consistency = 50;
  let consistencyNote = 'Insufficient signals to evaluate cross-surface consistency.';
  if (screenshots.items.length >= 2) {
    consistency = 85;
    consistencyNote = `Multiple viewport captures (${screenshots.items.length}) suggest cross-surface review.`;
  } else if (screenshots.items.length === 1 && pageContent && pageContent.body.length > 0) {
    consistency = 70;
    consistencyNote = 'Single viewport capture; mobile vs desktop cannot be confirmed.';
  } else if (screenshots.items.length === 1) {
    consistency = 60;
    consistencyNote = 'Single screenshot; consistency cannot be fully evaluated.';
  } else {
    consistency = 40;
    consistencyNote = 'No screenshots; consistency is unprovable from the bundle alone.';
  }

  // --- craft -------------------------------------------------------------
  // Craft: low accessibility findings + clean logs = good craft.
  let craft = 80;
  let craftNote = 'No accessibility findings in the evidence bundle.';
  if (accessibility) {
    const a = accessibility.summary;
    craft = clamp(100 - a.critical * 18 - a.serious * 9 - a.moderate * 4 - a.minor * 2, 0, 100);
    craftNote =
      `${a.critical} critical, ${a.serious} serious, ${a.moderate} moderate, ` +
      `and ${a.minor} minor accessibility finding${a.minor === 1 ? '' : 's'}.`;
  }
  if (metrics?.accessibility !== undefined) {
    // The Lighthouse accessibility score is a strong craft signal.
    craft = clamp(Math.round((craft + metrics.accessibility) / 2), 0, 100);
    craftNote += ` Lighthouse accessibility: ${metrics.accessibility}/100.`;
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'clarity', score: clarity, note: claritySignals.join('; ') },
    { rubricId: 'hierarchy', score: hierarchy, note: hierarchySignals.join('; ') },
    { rubricId: 'usability', score: usability, note: usabilitySignals.join('; ') },
    { rubricId: 'consistency', score: consistency, note: consistencyNote },
    { rubricId: 'craft', score: craft, note: craftNote },
  ];

  const overall = round(
    clarity * 0.25 + hierarchy * 0.2 + usability * 0.2 + consistency * 0.15 + craft * 0.2,
  );

  // --- confidence --------------------------------------------------------
  // Same evidence-density heuristic as the QA reviewer. Capped at 0.85
  // because the implementation is deterministic and does not use an LLM.
  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.headings.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.links.length > 0) evidencePoints += 1;
  if (accessibility) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (pageContent && pageContent.body.length === 0) {
    findings.push({
      title: 'No body copy',
      detail:
        'The page has no extractable body text. The user cannot understand what the product does from the page itself.',
      category: 'clarity',
      confidence: 0.9,
    });
  } else if (pageContent) {
    const wordCount = pageContent.body.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount < 30) {
      findings.push({
        title: 'Very thin body copy',
        detail: `Only ${wordCount} words of body copy. The product is likely under-explained above the fold.`,
        category: 'clarity',
        confidence: 0.75,
      });
    }
  }
  if (pageContent && pageContent.headings.length === 0 && pageContent.body.length > 0) {
    findings.push({
      title: 'No headings',
      detail: 'Body copy exists but no headings were extracted. The page lacks visible structure.',
      category: 'hierarchy',
      confidence: 0.85,
    });
  }
  if (pageContent && pageContent.links.length === 0) {
    findings.push({
      title: 'No links discovered',
      detail:
        'The page has no discoverable links. Users have no obvious next step or navigation path.',
      category: 'usability',
      confidence: 0.9,
    });
  }
  if (screenshots.items.length === 0) {
    findings.push({
      title: 'No screenshots',
      detail:
        'The bundle has no visual captures. The UX reviewer cannot judge hierarchy, polish, or mobile/desktop consistency.',
      category: 'consistency',
      confidence: 0.95,
    });
  } else if (screenshots.items.length === 1) {
    findings.push({
      title: 'Only one viewport captured',
      detail:
        'A single screenshot cannot reveal cross-surface issues (mobile vs desktop, dark mode, signed-out vs signed-in).',
      category: 'consistency',
      confidence: 0.8,
    });
  }
  if (accessibility && accessibility.summary.critical > 0) {
    findings.push({
      title: 'Critical accessibility findings',
      detail: `${accessibility.summary.critical} critical accessibility issue${accessibility.summary.critical === 1 ? '' : 's'} — craft and inclusive usability are at risk.`,
      category: 'craft',
      confidence: 0.9,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (clarity >= 80) strengths.push('Headline and copy communicate the value proposition clearly.');
  if (hierarchy >= 80) strengths.push('Page has a clear visual hierarchy (≥ 3 headings).');
  if (pageContent && pageContent.links.length >= 5) {
    strengths.push('Multiple primary navigation paths are visible.');
  }
  if (craft >= 85) strengths.push('No meaningful accessibility violations detected.');
  if (screenshots.items.length >= 2)
    strengths.push('Multiple viewport captures — cross-surface polish verified.');

  const weaknesses: string[] = [];
  if (pageContent && pageContent.body.length === 0) {
    weaknesses.push('No body copy extracted — the value proposition is invisible.');
  }
  if (pageContent && pageContent.headings.length === 0) {
    weaknesses.push('No headings — the page lacks visible structure.');
  }
  if (screenshots.items.length === 0) {
    weaknesses.push('No visual evidence — UX polish cannot be evaluated.');
  }
  if (accessibility && accessibility.summary.critical + accessibility.summary.serious > 0) {
    weaknesses.push(
      `${accessibility.summary.critical + accessibility.summary.serious} critical+serious accessibility issue(s) impact inclusive craft.`,
    );
  }

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (pageContent && pageContent.body.length === 0) {
    priorityFixes.push({
      title: 'Add a clear above-the-fold value proposition',
      description:
        'Without body copy, the product does not communicate what it is or who it is for. Add a one-sentence headline and 1–2 supporting sentences above the fold.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (pageContent && pageContent.headings.length === 0 && pageContent.body.length > 0) {
    priorityFixes.push({
      title: 'Add headings to structure the page',
      description:
        'No headings were extracted from the page. Add at least one H1 and a couple of H2s so the page reads as structured.',
      effort: 'low',
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
  if (accessibility && accessibility.summary.critical > 0) {
    priorityFixes.push({
      title: 'Fix critical accessibility violations',
      description:
        'Critical accessibility findings block users who rely on assistive technology. Address the top critical rule first, then re-run the analyzer.',
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
  };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = evidence.metadata.source;
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85 ? 'excellent' : a.overall >= 70 ? 'good' : a.overall >= 50 ? 'fair' : 'poor';
  return (
    `UX review of ${source} target "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const uxReviewer: Reviewer = {
  id: 'ux',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'ux') {
      return { ok: false, reason: `Expected reviewer 'ux', got '${output.reviewer}'.` };
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
        reviewer: 'ux',
        kind: 'aborted',
        message: 'UX reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'ux',
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

    const validate = uxReviewer.validate;
    if (!validate) {
      throw new Error('UX reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'ux',
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
 * `uxReviewer.run()` and is what the reviewer registry will
 * call when it dispatches the UX juror on a session.
 */
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return uxReviewer.run(ctx, options);
}

/**
 * `ReviewerFactory` for dependency injection. The current
 * implementation takes no dependencies; the signature exists
 * so a future LLM-backed variant can be slotted in without
 * changing the import surface (`createUxReviewer(deps)`).
 */
export const createUxReviewer: ReviewerFactory = (_deps) => uxReviewer;

/**
 * The `Reviewer` object itself, exported for tests and for
 * registries that prefer object-style registration over the
 * default module export.
 */
export { uxReviewer };

const uxModule: ReviewerModule = {
  reviewer: uxReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default uxModule;
