/**
 * agents/investor — Investor / Funding Lens reviewer
 *
 * Task 6.6 — Real implementation.
 *
 * Scores the product against seed-fundable signals: problem /
 * solution clarity, market framing, traction or demand, a
 * defensible angle, and founder-fit signals. For the GitHub
 * source, the reviewer can also use repository stars and the
 * README as a proxy for traction and clarity.
 *
 * Public surface (matches `ReviewerModule` in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`               — `'investor'`.
 *   - `investorReviewer`          — the `Reviewer` object.
 *   - `runReviewer`               — legacy function entry point.
 *   - `createInvestorReviewer`    — `ReviewerFactory` for DI.
 *   - `default`                   — the `ReviewerModule`.
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

export const REVIEWER_ID = 'investor' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'investor',
  role: REVIEWER_ROLES.investor,
  description:
    'Scores seed-fundable signals: problem / solution clarity, market framing, traction or demand, defensibility, and founder-fit signals.',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'problem-clarity',
    label: 'Problem clarity',
    description: 'Is the problem the product solves articulated specifically?',
    weight: 0.2,
  },
  {
    id: 'solution-clarity',
    label: 'Solution clarity',
    description: 'Is the solution — what the product does — explained crisply?',
    weight: 0.2,
  },
  {
    id: 'market',
    label: 'Market framing',
    description: 'Is there a plausible market / category the product is going after?',
    weight: 0.15,
  },
  {
    id: 'traction',
    label: 'Traction or demand',
    description: 'Any evidence of demand, waitlist, stars, downloads, or users?',
    weight: 0.2,
  },
  {
    id: 'defensibility',
    label: 'Defensibility',
    description: 'Is there a defensible angle — technology, distribution, brand, or community?',
    weight: 0.15,
  },
  {
    id: 'founder-fit',
    label: 'Founder-fit signals',
    description: 'Does the product read as focused, clear, and momentum-driven?',
    weight: 0.1,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

const MARKET_KEYWORDS = [
  'market',
  'category',
  'industry',
  'b2b',
  'b2c',
  'enterprise',
  'smb',
  'developers',
  'devs',
  'creators',
  'founders',
  'teams',
  'agencies',
  'startups',
  'consumers',
];

const DEFENSIBILITY_KEYWORDS = [
  'proprietary',
  'patent',
  'patented',
  'exclusive',
  'data moat',
  'community',
  'distribution',
  'platform',
  'network effect',
  'brand',
  'first-mover',
  'open-source',
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
  const { screenshots, pageContent, files, metrics, metadata } = evidence;

  const textHaystack = (
    pageContent ? `${pageContent.headings.join(' ')} ${pageContent.body}` : (files?.readme ?? '')
  ).toLowerCase();
  const hasReadme = !!(files?.readme && files.readme.length > 0);

  // --- problem clarity ---------------------------------------------------
  let problemClarity = 30;
  const problemSignals: string[] = [];
  if (pageContent && pageContent.headings.length > 0) {
    problemClarity += 20;
    problemSignals.push(
      `${pageContent.headings.length} heading${pageContent.headings.length === 1 ? '' : 's'} — likely frames the problem`,
    );
  }
  // The "Problem:" / "Why" / "Pain" pattern is a strong signal.
  const problemPatterns = [
    /\bproblem\b/,
    /\bpain\b/,
    /\bchallenge\b/,
    /\bwhy we built\b/,
    /\bwhy\b.*\bexist/,
    /\btired of\b/,
    /\bwithout\b/,
  ];
  if (problemPatterns.some((p) => p.test(textHaystack))) {
    problemClarity += 30;
    problemSignals.push('problem framing language detected');
  }
  if (pageContent && pageContent.body.length > 60) {
    problemClarity += 20;
    problemSignals.push('substantial body copy — likely elaborates the problem');
  }
  problemClarity = clamp(problemClarity, 0, 100);

  // --- solution clarity --------------------------------------------------
  let solutionClarity = 30;
  const solutionSignals: string[] = [];
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    solutionClarity += 25;
    solutionSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  }
  const solutionPatterns = [
    /\bhow it works\b/,
    /\bfeatures?\b/,
    /\bbuilt for\b/,
    /\bsolution\b/,
    /\boutcome\b/,
    /\bresult\b/,
  ];
  if (solutionPatterns.some((p) => p.test(textHaystack))) {
    solutionClarity += 25;
    solutionSignals.push('solution-framing language detected');
  }
  if (hasReadme) {
    solutionClarity += 20;
    solutionSignals.push('README present — likely explains the solution');
  }
  solutionClarity = clamp(solutionClarity, 0, 100);

  // --- market framing ----------------------------------------------------
  let market = 30;
  const marketSignals: string[] = [];
  const marketHits = MARKET_KEYWORDS.filter((k) => textHaystack.includes(k));
  if (marketHits.length >= 2) {
    market += 40;
    marketSignals.push(
      `market vocabulary present (${marketHits.length} match${marketHits.length === 1 ? '' : 'es'})`,
    );
  } else if (marketHits.length === 1) {
    market += 20;
    marketSignals.push(`market vocabulary present (${marketHits[0]})`);
  } else {
    marketSignals.push('no market vocabulary detected');
  }
  if (pageContent && pageContent.body.length > 100) {
    market += 15;
    marketSignals.push('substantial copy — likely articulates the market');
  }
  market = clamp(market, 0, 100);

  // --- traction ----------------------------------------------------------
  let traction = 25;
  const tractionSignals: string[] = [];
  if (metrics?.stars !== undefined) {
    // 1 star = 25, 10 stars = 50, 100 stars = 75, 1000 stars = 100
    if (metrics.stars >= 1000) {
      traction = 100;
      tractionSignals.push(`strong traction signal: ${metrics.stars} stars`);
    } else if (metrics.stars >= 100) {
      traction = clamp(75 + Math.round(Math.log10(metrics.stars) * 5), 0, 100);
      tractionSignals.push(`real traction: ${metrics.stars} stars`);
    } else if (metrics.stars >= 10) {
      traction = clamp(50 + metrics.stars, 0, 100);
      tractionSignals.push(`early traction: ${metrics.stars} stars`);
    } else {
      traction = clamp(25 + metrics.stars * 2, 0, 100);
      tractionSignals.push(`${metrics.stars} star${metrics.stars === 1 ? '' : 's'}`);
    }
  }
  const tractionPatterns = [
    /\bwaitlist\b/,
    /\bbacked by\b/,
    /\binvestors\b/,
    /\braised\b/,
    /\busers\b/,
    /\bcustomers\b/,
    /\bdownloads?\b/,
    /\bsignups?\b/,
    /\bbefore and after\b/,
  ];
  const tractionHits = tractionPatterns.filter((p) => p.test(textHaystack));
  if (tractionHits.length >= 1) {
    traction = clamp(traction + 15 * tractionHits.length, 0, 100);
    tractionSignals.push(
      `traction language detected (${tractionHits.length} match${tractionHits.length === 1 ? '' : 'es'})`,
    );
  } else {
    tractionSignals.push('no traction language detected');
  }
  traction = clamp(traction, 0, 100);

  // --- defensibility -----------------------------------------------------
  let defensibility = 30;
  const defensibilitySignals: string[] = [];
  const defenseHits = DEFENSIBILITY_KEYWORDS.filter((k) => textHaystack.includes(k));
  if (defenseHits.length >= 1) {
    defensibility += 30;
    defensibilitySignals.push(`defensibility vocabulary present (${defenseHits.join(', ')})`);
  } else {
    defensibilitySignals.push('no explicit defensibility framing');
  }
  if (hasReadme && files?.license !== undefined) {
    defensibility += 20;
    defensibilitySignals.push('README + license present — a community / OSS angle is plausible');
  } else if (hasReadme) {
    defensibility += 10;
    defensibilitySignals.push('README present');
  }
  if (metrics?.stars !== undefined && metrics.stars >= 100) {
    defensibility += 10;
    defensibilitySignals.push('star count suggests community momentum');
  }
  defensibility = clamp(defensibility, 0, 100);

  // --- founder-fit -------------------------------------------------------
  // A clean, focused, polished surface is a soft proxy for founder fit.
  let founderFit = 50;
  const founderSignals: string[] = [];
  if (screenshots.items.length > 0) founderFit += 10;
  if (pageContent && pageContent.headings.length >= 2) {
    founderFit += 15;
    founderSignals.push('structured headings — page is organized');
  }
  if (pageContent && pageContent.body.length > 200) {
    founderFit += 15;
    founderSignals.push('substantial copy — clear focus');
  }
  if (pageContent && pageContent.links.length >= 3) {
    founderFit += 10;
    founderSignals.push('multiple navigable paths — clear scope');
  }
  founderFit = clamp(founderFit, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'problem-clarity', score: problemClarity, note: problemSignals.join('; ') },
    { rubricId: 'solution-clarity', score: solutionClarity, note: solutionSignals.join('; ') },
    { rubricId: 'market', score: market, note: marketSignals.join('; ') },
    { rubricId: 'traction', score: traction, note: tractionSignals.join('; ') },
    { rubricId: 'defensibility', score: defensibility, note: defensibilitySignals.join('; ') },
    { rubricId: 'founder-fit', score: founderFit, note: founderSignals.join('; ') },
  ];

  const overall = round(
    problemClarity * 0.2 +
      solutionClarity * 0.2 +
      market * 0.15 +
      traction * 0.2 +
      defensibility * 0.15 +
      founderFit * 0.1,
  );

  // --- confidence --------------------------------------------------------
  let evidencePoints = 0;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (hasReadme) evidencePoints += 1;
  if (metrics?.stars !== undefined) evidencePoints += 1;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (problemClarity < 50) {
    findings.push({
      title: 'Problem is not articulated',
      detail:
        'The evidence does not surface a clear problem statement. Without a problem, the investor has nothing to fund.',
      category: 'problem',
      confidence: 0.85,
    });
  }
  if (traction < 40 && metrics?.stars === undefined) {
    findings.push({
      title: 'No traction signal',
      detail:
        'No traction or demand signal is present in the evidence. A seed pitch without traction needs an unusually strong narrative.',
      category: 'traction',
      confidence: 0.8,
    });
  }
  if (market < 50) {
    findings.push({
      title: 'Market framing is thin',
      detail:
        'The product does not articulate a market or category. Investors need to know which pond the product is fishing in.',
      category: 'market',
      confidence: 0.75,
    });
  }
  if (defensibility < 50) {
    findings.push({
      title: 'No defensibility angle',
      detail:
        'No language signals a defensible angle (proprietary tech, community, distribution, brand, network effects). The product looks easy to copy.',
      category: 'defensibility',
      confidence: 0.7,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (problemClarity >= 80) strengths.push('Problem is articulated clearly.');
  if (solutionClarity >= 80) strengths.push('Solution is explained crisply.');
  if (traction >= 70) strengths.push('Traction or demand is visible.');
  if (defensibility >= 70) strengths.push('A defensibility angle is articulated.');
  if (market >= 70) strengths.push('Market framing is concrete.');

  const weaknesses: string[] = [];
  if (problemClarity < 60) weaknesses.push('Problem statement is missing or vague.');
  if (traction < 40) weaknesses.push('No traction or demand signal.');
  if (defensibility < 50) weaknesses.push('No defensibility angle is articulated.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (problemClarity < 70) {
    priorityFixes.push({
      title: 'Add a clear problem statement',
      description:
        'Investors fund problems, not products. Add a one-sentence problem statement that names the audience and the pain.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (traction < 50 && metrics?.stars === undefined) {
    priorityFixes.push({
      title: 'Show any traction or demand signal',
      description:
        'A waitlist count, a "backed by" line, a customer logo, or even a private beta list helps. The investor lens punishes a vacuum here.',
      effort: 'medium',
      impact: 'high',
    });
  }
  if (market < 60) {
    priorityFixes.push({
      title: 'Name the market',
      description:
        'Add at least one sentence that names the market, category, or audience in concrete terms ("B2B fintech for SMBs", not "everyone").',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (defensibility < 60) {
    priorityFixes.push({
      title: 'State the defensibility angle',
      description:
        'Pick one and name it: proprietary technology, exclusive distribution, brand, or community. The investor will ask anyway — answer it first.',
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
    a.overall >= 85
      ? 'compelling'
      : a.overall >= 70
        ? 'promising'
        : a.overall >= 50
          ? 'mixed'
          : 'thin';
  return (
    `Investor review of ${source} target "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const investorReviewer: Reviewer = {
  id: 'investor',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'investor') {
      return { ok: false, reason: `Expected reviewer 'investor', got '${output.reviewer}'.` };
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
        reviewer: 'investor',
        kind: 'aborted',
        message: 'Investor reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'investor',
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

    const validate = investorReviewer.validate;
    if (!validate) {
      throw new Error('Investor reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'investor',
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
  return investorReviewer.run(ctx, options);
}

export const createInvestorReviewer: ReviewerFactory = (_deps) => investorReviewer;

export { investorReviewer };

const investorModule: ReviewerModule = {
  reviewer: investorReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default investorModule;
