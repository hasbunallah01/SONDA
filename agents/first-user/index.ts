/**
 * agents/first-user — First-time User reviewer
 *
 * Task 6.7 — Real implementation.
 *
 * Scores the product from the cold-start, first-impression
 * perspective: in 30 seconds, can a brand-new visitor figure
 * out what this product is, who it's for, and what to do next?
 *
 * Public surface (matches `ReviewerModule` in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`                 — `'first-user'`.
 *   - `firstUserReviewer`           — the `Reviewer` object.
 *   - `runReviewer`                 — legacy function entry point.
 *   - `createFirstUserReviewer`     — `ReviewerFactory` for DI.
 *   - `default`                     — the `ReviewerModule`.
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

export const REVIEWER_ID = 'first-user' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'first-user',
  role: REVIEWER_ROLES['first-user'],
  description:
    'Scores the product from the cold-start, first-impression perspective. In 30 seconds, can a new visitor figure out what this product is, who it is for, and what to do next?',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'purpose',
    label: 'Purpose clarity',
    description: "Is the product's purpose obvious above the fold?",
    weight: 0.25,
  },
  {
    id: 'plain-language',
    label: 'Plain language',
    description: 'Are the labels plain, or do they lean on jargon?',
    weight: 0.15,
  },
  {
    id: 'first-action',
    label: 'First action reachable',
    description: 'Can a new user complete the primary action without help?',
    weight: 0.25,
  },
  {
    id: 'trust',
    label: 'First-impression trust',
    description: 'Does the first impression inspire trust?',
    weight: 0.15,
  },
  {
    id: 'bounce-risk',
    label: 'Bounce risk',
    description: 'What friction is most likely to make a new visitor bounce?',
    weight: 0.2,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

/**
 * A small list of words that strongly suggest jargon or fluffy
 * positioning copy. Each match slightly erodes the
 * "plain-language" axis.
 */
const JARGON_WORDS = [
  'synergize',
  'synergy',
  'paradigm',
  'leverage',
  'disrupt',
  'revolutionize',
  'unleash',
  'empower',
  'seamless',
  'frictionless',
  'best-in-class',
  'world-class',
  'next-generation',
  'cutting-edge',
  'holistic',
  'robust',
  'scalable',
  'enterprise-grade',
];

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

const analyze = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, pageContent, metadata, logs } = evidence;

  // --- purpose clarity ---------------------------------------------------
  let purpose = 25;
  const purposeSignals: string[] = [];
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    purpose += 30;
    purposeSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    purposeSignals.push('no headline extracted — purpose is invisible above the fold');
  }
  if (metadata.facts.title && metadata.facts.title.length > 0) {
    purpose += 20;
    purposeSignals.push(`page title present ("${metadata.facts.title.slice(0, 60)}")`);
  }
  if (pageContent && pageContent.body.length > 0) {
    purpose += 15;
    purposeSignals.push('body copy is available to explain the purpose');
  }
  if (screenshots.items.length >= 1) {
    purpose += 5;
    purposeSignals.push('visual capture available — first-paint evidence exists');
  }
  purpose = clamp(purpose, 0, 100);

  // --- plain language ----------------------------------------------------
  let plainLanguage = 70;
  const plainSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length === 0) {
      plainSignals.push('no common jargon detected');
    } else {
      plainLanguage = clamp(plainLanguage - jargonHits.length * 10, 0, 100);
      plainSignals.push(`jargon detected: ${jargonHits.join(', ')}`);
    }
    if (pageContent.body.length > 0) {
      const wordCount = pageContent.body.split(/\s+/).filter(Boolean).length;
      if (wordCount > 0) {
        const avgWordLength =
          pageContent.body.split(/\s+/).reduce((sum, w) => sum + w.length, 0) / wordCount;
        if (avgWordLength > 6.5) {
          plainLanguage = clamp(plainLanguage - 10, 0, 100);
          plainSignals.push(`average word length ${avgWordLength.toFixed(1)} — copy may be dense`);
        }
      }
    }
  } else {
    plainSignals.push('no page content to evaluate plain language');
  }
  plainLanguage = clamp(plainLanguage, 0, 100);

  // --- first action reachable -------------------------------------------
  let firstAction = 25;
  const firstActionSignals: string[] = [];
  if (pageContent) {
    let ctaCount = 0;
    for (const link of pageContent.links) {
      const t = link.text.trim().toLowerCase();
      if (
        t.startsWith('get ') ||
        t.startsWith('sign ') ||
        t.startsWith('try ') ||
        t.startsWith('start ') ||
        t.startsWith('book ') ||
        t.startsWith('join ') ||
        t.startsWith('subscribe') ||
        t.startsWith('download') ||
        t.startsWith('install') ||
        t.startsWith('demo')
      ) {
        ctaCount += 1;
      }
    }
    if (ctaCount >= 1) {
      firstAction += 35;
      firstActionSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'} visible`);
    } else {
      firstActionSignals.push('no CTA-style links detected');
    }
    if (pageContent.links.length >= 5) {
      firstAction += 20;
      firstActionSignals.push('multiple navigable paths — a curious user can explore');
    } else if (pageContent.links.length >= 1) {
      firstAction += 10;
      firstActionSignals.push('at least one link present');
    }
  } else {
    firstActionSignals.push('no page content to evaluate first-action reachability');
  }
  if (screenshots.items.length === 0) {
    firstAction = clamp(firstAction - 10, 0, 100);
    firstActionSignals.push('no screenshots — primary action cannot be visually verified');
  }
  firstAction = clamp(firstAction, 0, 100);

  // --- trust -------------------------------------------------------------
  let trust = 60;
  const trustSignals: string[] = ['baseline trust from a clean surface'];
  if (metadata.facts.description) {
    trust += 10;
    trustSignals.push('meta description present');
  }
  if (pageContent) {
    // Trust signals in the body / links.
    const linkText = pageContent.links
      .map((l) => l.text)
      .join(' ')
      .toLowerCase();
    if (
      /(customer|testimonial|press|backed by|trusted by|used by|featured in|reviews?)/.test(
        linkText,
      )
    ) {
      trust += 20;
      trustSignals.push('trust / social-proof vocabulary present');
    }
  }
  // Runtime errors destroy first-impression trust.
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  if (errorCount > 0) {
    trust = clamp(trust - errorCount * 10, 0, 100);
    trustSignals.push(`${errorCount} runtime error${errorCount === 1 ? '' : 's'} erode trust`);
  }
  trust = clamp(trust, 0, 100);

  // --- bounce risk -------------------------------------------------------
  // Lower = more bounce risk. We compute a number and then map to the
  // rubric score (1 - normalized_bounce_risk) so a "high bounce risk"
  // means a low rubric score.
  let bounceRisk = 30; // start at 30 — moderate baseline
  const bounceSignals: string[] = [];
  if (!firstHeading) {
    bounceRisk += 25;
    bounceSignals.push('no headline — visitor cannot orient in 5 seconds');
  }
  if (pageContent && pageContent.body.length === 0) {
    bounceRisk += 20;
    bounceSignals.push('no body copy — no reason to stay');
  }
  if (pageContent && pageContent.links.length === 0) {
    bounceRisk += 15;
    bounceSignals.push('no links — visitor has nowhere to go');
  }
  if (screenshots.items.length === 0) {
    bounceRisk += 10;
    bounceSignals.push('no visual evidence — visitor cannot evaluate visually');
  }
  if (errorCount > 0) {
    bounceRisk += 15;
    bounceSignals.push('runtime errors — visitor will see a broken surface');
  }
  // Strong signals that REDUCE bounce risk.
  if (pageContent && pageContent.body.length > 200) bounceRisk -= 10;
  if (pageContent && pageContent.links.length >= 5) bounceRisk -= 10;
  bounceRisk = clamp(bounceRisk, 0, 100);
  // Convert: high bounce risk → low rubric score.
  const bounce = clamp(100 - bounceRisk, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'purpose', score: purpose, note: purposeSignals.join('; ') },
    { rubricId: 'plain-language', score: plainLanguage, note: plainSignals.join('; ') },
    { rubricId: 'first-action', score: firstAction, note: firstActionSignals.join('; ') },
    { rubricId: 'trust', score: trust, note: trustSignals.join('; ') },
    { rubricId: 'bounce-risk', score: bounce, note: bounceSignals.join('; ') },
  ];

  const overall = round(
    purpose * 0.25 + plainLanguage * 0.15 + firstAction * 0.25 + trust * 0.15 + bounce * 0.2,
  );

  // --- confidence --------------------------------------------------------
  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.headings.length > 0) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!firstHeading) {
    findings.push({
      title: 'No headline — the visitor cannot orient',
      detail:
        'There is no H1 above the fold. A first-time visitor will not know what the product is within 5 seconds and will bounce.',
      category: 'purpose',
      confidence: 0.95,
    });
  }
  if (pageContent && pageContent.body.length > 0) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length > 0) {
      findings.push({
        title: 'Jargon in the copy',
        detail: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time visitors. Plain language wins.`,
        category: 'plain-language',
        confidence: 0.8,
      });
    }
  }
  if (pageContent && pageContent.links.length === 0) {
    findings.push({
      title: 'No links — no way to start',
      detail: 'A first-time user has no obvious next step. The page reads as a dead end.',
      category: 'first-action',
      confidence: 0.9,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Runtime errors visible',
      detail: `${errorCount} runtime error${errorCount === 1 ? '' : 's'} detected. A new visitor will see a broken surface.`,
      category: 'trust',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (purpose >= 80) strengths.push('Purpose is obvious above the fold.');
  if (plainLanguage >= 80) strengths.push('Copy is in plain, non-jargon language.');
  if (firstAction >= 80) strengths.push('A primary action is reachable in one click.');
  if (bounce >= 80) strengths.push('Bounce risk appears low.');

  const weaknesses: string[] = [];
  if (!firstHeading) weaknesses.push('No headline — the visitor cannot orient.');
  if (pageContent && pageContent.links.length === 0) weaknesses.push('No links — no path forward.');
  if (errorCount > 0)
    weaknesses.push(
      `${errorCount} runtime error${errorCount === 1 ? '' : 's'} visible to visitors.`,
    );

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!firstHeading) {
    priorityFixes.push({
      title: 'Add a clear, plain headline',
      description:
        'A new visitor has 5 seconds. State what the product is and who it is for in one short sentence.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (pageContent && pageContent.links.length === 0) {
    priorityFixes.push({
      title: 'Add at least one link / next step',
      description:
        'Give the visitor a way to start. A "Get started" button or a "Learn more" link is the minimum.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length > 0) {
      priorityFixes.push({
        title: 'Remove jargon from the copy',
        description: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time visitors. Replace with plain language.`,
        effort: 'low',
        impact: 'medium',
      });
    }
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve runtime errors',
      description:
        'Runtime errors are visible to the visitor and crush first-impression trust. Triage and fix.',
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
    a.overall >= 85
      ? 'inviting'
      : a.overall >= 70
        ? 'welcoming'
        : a.overall >= 50
          ? 'mixed'
          : 'hostile';
  return (
    `First-time-user review of ${source} target "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const firstUserReviewer: Reviewer = {
  id: 'first-user',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'first-user') {
      return { ok: false, reason: `Expected reviewer 'first-user', got '${output.reviewer}'.` };
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
        reviewer: 'first-user',
        kind: 'aborted',
        message: 'First-time user reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'first-user',
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

    const validate = firstUserReviewer.validate;
    if (!validate) {
      throw new Error('First-time user reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'first-user',
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
  return firstUserReviewer.run(ctx, options);
}

export const createFirstUserReviewer: ReviewerFactory = (_deps) => firstUserReviewer;

export { firstUserReviewer };

const firstUserModule: ReviewerModule = {
  reviewer: firstUserReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default firstUserModule;
