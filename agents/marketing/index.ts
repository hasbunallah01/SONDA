/**
 * agents/marketing — Marketing / GTM Expert reviewer
 *
 * Task 6.5 — Real implementation.
 *
 * Decides whether the product's story, positioning, and
 * go-to-market are clear and conversion-ready. Looks at the
 * evidence bundle for the signals we can extract
 * deterministically — headline, copy density, links (CTAs,
 * social proof), screenshots (visual identity), and metadata
 * (title, description).
 *
 * Like the QA and UX reviewers, the current implementation is
 * **deterministic**: it does not call an LLM. A future task can
 * drop in an LLM-backed variant via the `ReviewerFactory`
 * (`createMarketingReviewer`) without changing this module's
 * public surface.
 *
 * Public surface (matches the `ReviewerModule` shape in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`                  — `'marketing'`.
 *   - `marketingReviewer`            — the `Reviewer` object.
 *   - `runReviewer`                  — legacy function entry point.
 *   - `createMarketingReviewer`      — `ReviewerFactory` for DI.
 *   - `default`                      — the `ReviewerModule`.
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

export const REVIEWER_ID = 'marketing' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'marketing',
  role: REVIEWER_ROLES.marketing,
  description:
    'Decides whether the product has a clear story, positioning, and go-to-market. Scores positioning, differentiation, conversion clarity, copy quality, and audience fit.',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'positioning',
    label: 'Positioning & value proposition',
    description: 'Is the product positioning clear from the headline, subhead, and metadata?',
    weight: 0.25,
  },
  {
    id: 'differentiation',
    label: 'Differentiation',
    description: 'Is there a clear "why this, not that" framing vs the obvious alternative?',
    weight: 0.2,
  },
  {
    id: 'conversion',
    label: 'Conversion clarity',
    description: 'Are calls to action, social proof, and trust signals visible?',
    weight: 0.25,
  },
  {
    id: 'copy',
    label: 'Copy quality',
    description: 'Is the copy plain, specific, and written for a defined audience?',
    weight: 0.15,
  },
  {
    id: 'audience-fit',
    label: 'Audience fit',
    description: 'Does the page read like it was written for a specific person?',
    weight: 0.15,
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
 * Crude heuristic for "is this an action verb" — used to detect
 * CTAs (e.g. "Get started", "Sign up", "Try it free", "Book a demo").
 * Returns true if the link text starts with one of the recognized
 * verbs or contains a known action phrase.
 */
const isLikelyCta = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  const verbStarts = [
    'get ',
    'sign ',
    'try ',
    'start ',
    'book ',
    'join ',
    'subscribe',
    'download',
    'install',
    'request',
    'contact',
    'demo',
    'schedule',
    'buy ',
    'see ',
    'view ',
    'launch',
    'claim',
    'reserve',
  ];
  return verbStarts.some((v) => t.startsWith(v));
};

/**
 * Crude heuristic for "is this likely social proof / trust signal".
 * Looks for known phrases in link text or hrefs.
 */
const isLikelySocialProof = (text: string, href: string): boolean => {
  const t = `${text} ${href}`.toLowerCase();
  return (
    t.includes('customer') ||
    t.includes('testimonial') ||
    t.includes('case stud') ||
    t.includes('press') ||
    t.includes('logo') ||
    t.includes('trust') ||
    t.includes('review') ||
    t.includes('rating') ||
    t.includes('backed by') ||
    t.includes('used by') ||
    t.includes('featured in')
  );
};

/**
 * Score a single `EvidenceBundle` against the five Marketing rubric
 * axes and roll the per-axis scores up into an overall score,
 * confidence, findings, strengths, weaknesses, and priority
 * fixes.
 *
 * Pure: reads only the bundle.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, pageContent, metrics, metadata } = evidence;

  // --- positioning -------------------------------------------------------
  // Headline + subhead + metadata (title / description).
  let positioning = 30;
  const positioningSignals: string[] = [];
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    positioning += 25;
    positioningSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    positioningSignals.push('no headline (H1) extracted');
  }
  if (metadata.facts.title && metadata.facts.title.length > 0) {
    positioning += 15;
    positioningSignals.push(`metadata title present ("${metadata.facts.title.slice(0, 60)}")`);
  } else {
    positioningSignals.push('no metadata title in the bundle');
  }
  if (metadata.facts.description && metadata.facts.description.length > 0) {
    positioning += 20;
    positioningSignals.push('metadata description present');
  } else {
    positioningSignals.push('no metadata description');
  }
  if (pageContent && pageContent.body.length > 0) {
    positioning += 10;
    positioningSignals.push('body copy present to support the positioning');
  }
  positioning = clamp(positioning, 0, 100);

  // --- differentiation ---------------------------------------------------
  // Differentiation is hard to detect deterministically. We look for
  // comparison-style language ("vs", "unlike", "alternative", or for
  // GitHub: a competitive advantage flag in metadata).
  let differentiation = 35;
  const differentiationSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const compareHits =
      (haystack.match(/\bvs\.?\b/g)?.length ?? 0) +
      (haystack.match(/\bversus\b/g)?.length ?? 0) +
      (haystack.match(/\bunlike\b/g)?.length ?? 0) +
      (haystack.match(/\balternative\b/g)?.length ?? 0) +
      (haystack.match(/\bbetter than\b/g)?.length ?? 0) +
      (haystack.match(/\binstead of\b/g)?.length ?? 0);
    if (compareHits >= 1) {
      differentiation += 40;
      differentiationSignals.push(
        `comparison-style language detected (${compareHits} hit${compareHits === 1 ? '' : 's'})`,
      );
    } else {
      differentiationSignals.push('no explicit comparison/alternative framing detected');
    }
    if (pageContent.headings.length >= 3) {
      differentiation += 15;
      differentiationSignals.push(
        'multiple headings — page likely articulates more than one angle',
      );
    }
  } else {
    differentiationSignals.push('no page content to evaluate differentiation');
  }
  differentiation = clamp(differentiation, 0, 100);

  // --- conversion --------------------------------------------------------
  // CTAs in link text + screenshots (visual identity / hero).
  let conversion = 35;
  const conversionSignals: string[] = [];
  let ctaCount = 0;
  if (pageContent) {
    for (const link of pageContent.links) {
      if (isLikelyCta(link.text)) ctaCount += 1;
    }
    if (ctaCount >= 1) {
      conversion += 30;
      conversionSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'} detected`);
    } else {
      conversionSignals.push('no CTA-style links detected in page content');
    }
    if (ctaCount >= 3) {
      conversion += 20;
      conversionSignals.push('multiple CTAs — clear primary action is reinforced');
    }
  } else {
    conversionSignals.push('no page content to evaluate conversion');
  }
  if (screenshots.items.length >= 1) {
    conversion += 5;
    conversionSignals.push('hero / above-the-fold visual captured');
  }
  // Trust signals: social-proof-ish links.
  let socialProof = 0;
  if (pageContent) {
    for (const link of pageContent.links) {
      if (isLikelySocialProof(link.text, link.href)) socialProof += 1;
    }
    if (socialProof >= 1) {
      conversion = clamp(conversion + 10, 0, 100);
      conversionSignals.push(
        `${socialProof} social-proof/trust-signal link${socialProof === 1 ? '' : 's'}`,
      );
    }
  }
  conversion = clamp(conversion, 0, 100);

  // --- copy quality ------------------------------------------------------
  // Body word count, sentence length, link density.
  let copy = 50;
  let copyNote = 'No body copy to evaluate.';
  if (pageContent && pageContent.body.length > 0) {
    const words = pageContent.body.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount >= 60) {
      copy += 25;
      copyNote = `Substantial copy (${wordCount} words).`;
    } else if (wordCount >= 20) {
      copy += 15;
      copyNote = `Modest copy (${wordCount} words) — sufficient for a focused positioning.`;
    } else {
      copy += 5;
      copyNote = `Thin copy (${wordCount} word${wordCount === 1 ? '' : 's'}).`;
    }
    if (wordCount > 0) {
      const linkDensity = pageContent.links.length / wordCount;
      if (linkDensity > 0 && linkDensity < 0.2) {
        copy += 15;
        copyNote += ' Reasonable link density.';
      } else if (linkDensity >= 0.2) {
        copy -= 10;
        copyNote += ' Link density is high — copy may feel like a list of links.';
      }
    }
  }
  copy = clamp(copy, 0, 100);

  // --- audience fit ------------------------------------------------------
  // First-person language ("you", "your") and any "Built for X" or
  // similar explicit-audience phrase.
  let audienceFit = 40;
  const audienceSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const youCount =
      (haystack.match(/\byou\b/g)?.length ?? 0) + (haystack.match(/\byour\b/g)?.length ?? 0);
    if (youCount >= 2) {
      audienceFit += 35;
      audienceSignals.push(
        `second-person voice detected (${youCount} hit${youCount === 1 ? '' : 's'})`,
      );
    } else if (youCount === 1) {
      audienceFit += 15;
      audienceSignals.push('one second-person reference — some audience-direct language');
    } else {
      audienceSignals.push('no second-person voice — copy may feel generic');
    }
    const audiencePhrases = [
      'built for',
      'designed for',
      'for teams',
      'for developers',
      'for founders',
      'for creators',
      'for marketers',
      'perfect for',
      'made for',
    ];
    if (audiencePhrases.some((p) => haystack.includes(p))) {
      audienceFit += 15;
      audienceSignals.push('explicit "for X" audience phrase detected');
    }
  } else {
    audienceSignals.push('no page content to evaluate audience fit');
  }
  audienceFit = clamp(audienceFit, 0, 100);

  // Pull in Lighthouse SEO as a small bonus signal for marketing —
  // SEO is downstream of "clear positioning" so a high score is a
  // mild positive signal.
  if (metrics?.seo !== undefined) {
    audienceFit = clamp(Math.round((audienceFit + metrics.seo) / 2), 0, 100);
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'positioning', score: positioning, note: positioningSignals.join('; ') },
    {
      rubricId: 'differentiation',
      score: differentiation,
      note: differentiationSignals.join('; '),
    },
    { rubricId: 'conversion', score: conversion, note: conversionSignals.join('; ') },
    { rubricId: 'copy', score: copy, note: copyNote },
    { rubricId: 'audience-fit', score: audienceFit, note: audienceSignals.join('; ') },
  ];

  const overall = round(
    positioning * 0.25 +
      differentiation * 0.2 +
      conversion * 0.25 +
      copy * 0.15 +
      audienceFit * 0.15,
  );

  // --- confidence --------------------------------------------------------
  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.headings.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.links.length > 0) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!firstHeading) {
    findings.push({
      title: 'No headline extracted',
      detail:
        'The page does not surface a clear H1. Without a headline, the visitor cannot determine what the product is in the first 5 seconds.',
      category: 'positioning',
      confidence: 0.95,
    });
  }
  if (!metadata.facts.description) {
    findings.push({
      title: 'No meta description',
      detail:
        'No `<meta name="description">` content was captured. The product misses an opportunity to articulate positioning in search and social previews.',
      category: 'positioning',
      confidence: 0.9,
    });
  }
  if (ctaCount === 0) {
    findings.push({
      title: 'No CTA detected',
      detail:
        'No link text matches common call-to-action patterns ("Get started", "Sign up", "Try", "Book"). The page may lack a clear primary action.',
      category: 'conversion',
      confidence: 0.85,
    });
  }
  if (socialProof === 0) {
    findings.push({
      title: 'No social proof / trust signals',
      detail:
        'No link matches common social-proof patterns (customers, testimonials, press, "backed by"). Trust signals are absent from the captured evidence.',
      category: 'conversion',
      confidence: 0.7,
    });
  }
  if (pageContent && pageContent.body.length > 0) {
    const words = pageContent.body.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length < 20) {
      findings.push({
        title: 'Thin body copy',
        detail: `Only ${words.length} words of body copy. The positioning is unlikely to be persuasive.`,
        category: 'copy',
        confidence: 0.75,
      });
    }
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (positioning >= 80) strengths.push('Headline + metadata form a clear positioning statement.');
  if (ctaCount >= 2) strengths.push('Multiple CTAs — primary action is reinforced.');
  if (socialProof >= 1) strengths.push('Social proof / trust signals are visible.');
  if (audienceFit >= 75)
    strengths.push('Copy is written in a second-person voice for a defined audience.');
  if (copy >= 80) strengths.push('Copy is substantial and well-paced.');

  const weaknesses: string[] = [];
  if (positioning < 60)
    weaknesses.push('Positioning is unclear — headline / metadata are missing or thin.');
  if (ctaCount === 0) weaknesses.push('No CTAs detected in the page content.');
  if (socialProof === 0) weaknesses.push('No social proof or trust signals surfaced.');
  if (differentiation < 50) weaknesses.push('No explicit "vs alternative" framing detected.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (positioning < 70) {
    priorityFixes.push({
      title: 'Sharpen the headline and subhead',
      description:
        'Add a one-sentence headline and a one-sentence subhead that name the audience and the outcome. The first 5 seconds decide whether the visitor stays.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (ctaCount === 0) {
    priorityFixes.push({
      title: 'Add a primary call-to-action',
      description:
        'No CTA-style link was detected. Add a clear primary action above the fold (e.g. "Get started", "Try it free", "Book a demo").',
      effort: 'low',
      impact: 'high',
    });
  }
  if (socialProof === 0) {
    priorityFixes.push({
      title: 'Add social proof',
      description:
        'Add at least one trust signal — a customer logo strip, a testimonial, a "backed by" line, or a press mention. Visitors need a reason to believe.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (differentiation < 50) {
    priorityFixes.push({
      title: 'State the differentiation explicitly',
      description:
        'Add a "Unlike X, we Y" or "Built for X, not for Y" line so the visitor knows why this is different from the obvious alternative.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (!metadata.facts.description) {
    priorityFixes.push({
      title: 'Write a meta description',
      description:
        'Add a `<meta name="description">` with a one-sentence positioning statement. This surfaces in search results and social previews.',
      effort: 'low',
      impact: 'low',
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
    `Marketing review of ${source} target "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const marketingReviewer: Reviewer = {
  id: 'marketing',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'marketing') {
      return { ok: false, reason: `Expected reviewer 'marketing', got '${output.reviewer}'.` };
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
        reviewer: 'marketing',
        kind: 'aborted',
        message: 'Marketing reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'marketing',
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

    const validate = marketingReviewer.validate;
    if (!validate) {
      throw new Error('Marketing reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'marketing',
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
  return marketingReviewer.run(ctx, options);
}

export const createMarketingReviewer: ReviewerFactory = (_deps) => marketingReviewer;

export { marketingReviewer };

const marketingModule: ReviewerModule = {
  reviewer: marketingReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default marketingModule;
