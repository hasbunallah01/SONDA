/**
 * features/verdict-engine — Verdict aggregation
 *
 * Task 6.11 — Verdict Engine.
 *
 * Pure aggregation logic. Takes the array of `ReviewerOutput`s
 * produced by the reviewer pipeline and returns a single
 * `Verdict` object:
 *
 *   - Aggregated overall score (weighted by `descriptor.defaultWeight`).
 *   - Categorical status (Launch Ready / Almost There / Needs
 *     Work / Not Ready) derived from the overall score.
 *   - Top strengths and weaknesses (rolled up from per-reviewer
 *     lists, ordered by reviewer confidence / impact).
 *   - Prioritized recommendations (merged + ranked by impact
 *     desc, effort asc).
 *   - A one-line headline and a multi-sentence summary.
 *
 * This module is **pure**: it does not touch the database, the
 * network, or `Date.now()`. All side effects live in
 * `services/verdict.ts`, which calls into here.
 *
 * Public API
 *   - `computeVerdict(outputs)` — the single entry point.
 *   - `verdictStatusFromScore(score)` — pure mapping from a
 *     numeric score to its `VerdictStatus`.
 *   - `aggregateScore(outputs)` — pure weighted average.
 *   - `mergeAndPrioritizeFixes(outputs)` — pure fix merging.
 *
 * Out of scope (per task)
 *   - Persistence. The `ReviewResult` row is written by
 *     `services/verdict.ts`, not here.
 *   - LLM commentary. The summary is templated from reviewer
 *     outputs; an LLM-backed variant is a future task.
 */

import type { PriorityFix, ReviewerDescriptor, ReviewerId, ReviewerOutput } from '@/agents/types';
import { REVIEWER_ROLES } from '@/agents/types';
import type { Verdict, VerdictStatus } from '@/types/review';

/* -------------------------------------------------------------------------- */
/* Verdict status thresholds                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The verdict status thresholds, applied to the aggregated
 * overall score (0–100). Centralized here so the UI, the API,
 * and the verdict engine all agree.
 *
 *   ≥ 85 → 'ready'        (Launch Ready)
 *   ≥ 70 → 'almost'       (Almost There)
 *   ≥ 50 → 'needs-work'   (Needs Work)
 *   < 50 → 'not-ready'    (Not Ready)
 */
export const VERDICT_THRESHOLDS = {
  ready: 85,
  almost: 70,
  needsWork: 50,
} as const;

export const verdictStatusFromScore = (score: number): VerdictStatus => {
  if (score >= VERDICT_THRESHOLDS.ready) return 'ready';
  if (score >= VERDICT_THRESHOLDS.almost) return 'almost';
  if (score >= VERDICT_THRESHOLDS.needsWork) return 'needs-work';
  return 'not-ready';
};

/**
 * The user-facing label for each verdict status.
 */
export const VERDICT_LABELS: Readonly<Record<VerdictStatus, string>> = {
  ready: 'Launch Ready',
  almost: 'Almost There',
  'needs-work': 'Needs Work',
  'not-ready': 'Not Ready',
};

/* -------------------------------------------------------------------------- */
/* Score aggregation                                                          */
/* -------------------------------------------------------------------------- */

const DEFAULT_WEIGHT = 0.2;

/**
 * Static descriptor lookup. The verdict engine needs
 * `defaultWeight` for each reviewer; the canonical home of
 * that data is the `Reviewer.descriptor` field, but the
 * verdict engine does not import the live reviewers (that
 * would couple the engine to the runtime). Instead we mirror
 * the defaults from `agents/types.ts#REVIEWER_ROLES` (which
 * is co-located with the type definitions) and a small map
 * of weights. Adding a new reviewer = one new entry here.
 */
const DEFAULT_DESCRIPTORS: Readonly<Record<ReviewerId, Pick<ReviewerDescriptor, 'defaultWeight'>>> =
  {
    qa: { defaultWeight: 0.2 },
    ux: { defaultWeight: 0.2 },
    marketing: { defaultWeight: 0.15 },
    investor: { defaultWeight: 0.15 },
    judge: { defaultWeight: 0.15 },
    'first-user': { defaultWeight: 0.15 },
  };

/**
 * Aggregate per-reviewer scores into a single 0–100 overall
 * score, weighted by each reviewer's `defaultWeight`.
 *
 * Failed reviewers (score = 0, produced by the pipeline's
 * failure path) are excluded from the average — including
 * them would drag a partially-failed pipeline down to 0. A
 * future task can layer "down-weight failed reviewers"
 * behavior on top of this pure function.
 *
 * @param outputs the per-reviewer outputs from the pipeline.
 * @returns the weighted overall score, rounded to an integer.
 */
export const aggregateScore = (outputs: ReadonlyArray<ReviewerOutput>): number => {
  if (outputs.length === 0) return 0;

  const successful = outputs.filter((o) => o.score > 0 || o.confidence > 0);
  if (successful.length === 0) return 0;

  let weightSum = 0;
  let weightedScore = 0;
  for (const output of successful) {
    const w = DEFAULT_DESCRIPTORS[output.reviewer]?.defaultWeight ?? DEFAULT_WEIGHT;
    weightSum += w;
    weightedScore += output.score * w;
  }

  if (weightSum === 0) return 0;
  return Math.round(weightedScore / weightSum);
};

/* -------------------------------------------------------------------------- */
/* Strengths + weaknesses rollup                                              */
/* -------------------------------------------------------------------------- */

const IMPACT_RANK: Readonly<Record<PriorityFix['impact'], number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

const EFFORT_RANK: Readonly<Record<PriorityFix['effort'], number>> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Merge and deduplicate `priorityFixes` from every reviewer.
 *
 * The dedup is by *normalized title* (case-insensitive, whitespace
 * collapsed) — reviewers often say the same thing in different
 * words, and SONDA presents a single ranked list to the user.
 * When two reviewers suggest the same fix, we keep the highest
 * impact and the lowest effort, and bump the count.
 */
const mergeAndPrioritizeFixes = (
  outputs: ReadonlyArray<ReviewerOutput>,
  limit = 7,
): PriorityFix[] => {
  const byKey = new Map<
    string,
    PriorityFix & { _sources: Set<ReviewerId>; _impactRank: number; _effortRank: number }
  >();

  for (const output of outputs) {
    for (const fix of output.priorityFixes) {
      const key = fix.title.trim().toLowerCase().replace(/\s+/g, ' ');
      const existing = byKey.get(key);
      if (existing) {
        existing._sources.add(output.reviewer);
        // Keep the higher impact / lower effort.
        if (IMPACT_RANK[fix.impact] > existing._impactRank) {
          existing.impact = fix.impact;
          existing._impactRank = IMPACT_RANK[fix.impact];
        }
        if (EFFORT_RANK[fix.effort] < existing._effortRank) {
          existing.effort = fix.effort;
          existing._effortRank = EFFORT_RANK[fix.effort];
        }
        continue;
      }
      byKey.set(key, {
        ...fix,
        _sources: new Set<ReviewerId>([output.reviewer]),
        _impactRank: IMPACT_RANK[fix.impact],
        _effortRank: EFFORT_RANK[fix.effort],
      });
    }
  }

  // Rank: impact desc, then effort asc. Stable: original insertion order on ties.
  const ranked = Array.from(byKey.values()).sort((a, b) => {
    if (a._impactRank !== b._impactRank) return b._impactRank - a._impactRank;
    if (a._effortRank !== b._effortRank) return a._effortRank - b._effortRank;
    return 0;
  });

  return ranked
    .slice(0, limit)
    .map(({ _sources: _s, _impactRank: _i, _effortRank: _e, ...rest }) => {
      void _s;
      void _i;
      void _e;
      return rest;
    });
};

/**
 * Roll up per-reviewer strengths and weaknesses.
 *
 * Each reviewer's list is prefixed with their role (e.g.
 * "UX Designer: ...") so the user can see who flagged what.
 * We de-duplicate by normalized line text and cap the lists
 * to keep the response payload small.
 */
const rollupLists = (
  outputs: ReadonlyArray<ReviewerOutput>,
  field: 'strengths' | 'weaknesses',
  limit = 5,
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const output of outputs) {
    const role = REVIEWER_ROLES[output.reviewer];
    for (const raw of output[field]) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${role}: ${trimmed}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Headline + summary                                                         */
/* -------------------------------------------------------------------------- */

const headlineFor = (status: VerdictStatus, score: number): string => {
  switch (status) {
    case 'ready':
      return `Launch Ready — score ${score}/100`;
    case 'almost':
      return `Almost There — score ${score}/100`;
    case 'needs-work':
      return `Needs Work — score ${score}/100`;
    case 'not-ready':
      return `Not Ready — score ${score}/100`;
  }
};

/**
 * Build a multi-sentence summary that includes the per-reviewer
 * scores (so the user can see where the overall came from),
 * the verdict status, and the top priority fix.
 */
const summaryFor = (
  outputs: ReadonlyArray<ReviewerOutput>,
  status: VerdictStatus,
  score: number,
  topFix: PriorityFix | undefined,
): string => {
  const successful = outputs.filter((o) => o.score > 0 || o.confidence > 0);
  const parts: string[] = [];

  parts.push(`The jury returned an overall score of ${score}/100 (${VERDICT_LABELS[status]}).`);

  if (successful.length > 0) {
    const perReviewer = successful
      .map((o) => `${REVIEWER_ROLES[o.reviewer]} ${o.score}/100`)
      .join(', ');
    parts.push(`Per reviewer: ${perReviewer}.`);
  } else {
    parts.push('No reviewer produced a usable output.');
  }

  if (topFix) {
    parts.push(`Top priority: ${topFix.title}.`);
  }

  return parts.join(' ');
};

/* -------------------------------------------------------------------------- */
/* Top-level entry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compute the final `Verdict` from an array of `ReviewerOutput`s.
 *
 * Pure: no I/O, no time-of-day checks, no random. Two calls with
 * the same `outputs` return deeply equal `Verdict` objects.
 *
 * @param outputs the outputs from the reviewer pipeline.
 * @returns the computed `Verdict` (see `types/review.ts#Verdict`).
 */
export const computeVerdict = (outputs: ReadonlyArray<ReviewerOutput>): Verdict => {
  const overallScore = aggregateScore(outputs);
  const status = verdictStatusFromScore(overallScore);
  const priorityFixes = mergeAndPrioritizeFixes(outputs);
  const topStrengths = rollupLists(outputs, 'strengths');
  const topWeaknesses = rollupLists(outputs, 'weaknesses');
  const headline = headlineFor(status, overallScore);
  const summary = summaryFor(outputs, status, overallScore, priorityFixes[0]);

  return {
    overallScore,
    status,
    headline,
    summary,
    topStrengths,
    topWeaknesses,
    priorityFixes,
    reviewerOutputs: [...outputs],
  };
};
