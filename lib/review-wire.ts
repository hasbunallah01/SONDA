/**
 * lib/review-wire.ts — Shared wire projection for review sessions.
 *
 * Extracted from `app/api/reviews/[id]/route.ts` so both the results
 * API (`GET /api/reviews/:id`) and the agent-facing ASP route
 * (`POST /api/asp/review`) return the exact same payload shape.
 * Pure move — no behavior change.
 *
 * The single entry point is `loadReviewWirePayload(id)`:
 *   - returns `null` if the session does not exist,
 *   - otherwise returns `{ session, evidence, reviewerResults, verdict }`
 *     in the stable wire shape the frontend already consumes.
 */

import { prisma, ReviewerType } from '@/lib/db';
import type { PriorityFix, ReviewerId, ReviewerOutput } from '@/agents/types';
import { REVIEWER_ROLES } from '@/agents/types';
import { computeVerdict } from '@/features/verdict-engine';
import type { EvidenceBundle } from '@/types/evidence';
import type { Verdict } from '@/types/review';

/* -------------------------------------------------------------------------- */
/* Wire types                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A single reviewer's result, projected to the wire shape.
 *
 * `priorityFixes` is typed as a structured object array; the
 * raw `Json` from the DB column is parsed into the application
 * `PriorityFix` shape before being returned.
 */
export type WireReviewerResult = {
  id: string;
  reviewer: ReviewerId;
  reviewerRole: string;
  score: number;
  confidence: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  /** True if the reviewer failed to produce a usable output. */
  failed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * The wire shape of the verdict. Mirrors `types/review.ts#Verdict`
 * but with `reviewerOutputs` omitted (the per-reviewer results
 * are at the top level of the response so the client does not
 * have to dig into the verdict to render them).
 */
export type WireVerdict = Omit<Verdict, 'reviewerOutputs'> & {
  reviewerOutputs?: never;
};

/** The full wire payload for one review session. */
export type ReviewWirePayload = {
  session: {
    id: string;
    type: string;
    status: string;
    target: string;
    createdAt: string;
    updatedAt: string;
  };
  evidence: EvidenceBundle | null;
  reviewerResults: WireReviewerResult[];
  verdict: WireVerdict | null;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const VALID_STATUSES = ['ready', 'almost', 'needs-work', 'not-ready'] as const;
type VerdictStatus = (typeof VALID_STATUSES)[number];

const parseStatus = (raw: string): VerdictStatus => {
  return (VALID_STATUSES as ReadonlyArray<string>).includes(raw)
    ? (raw as VerdictStatus)
    : 'needs-work';
};

/**
 * The Prisma `ReviewerType` enum maps to the application
 * `ReviewerId` union. The mapping is exhaustive — TypeScript
 * will fail the build if a new `ReviewerType` is added without
 * registering it here.
 */
const REVIEWER_TYPE_TO_ID: Readonly<Record<ReviewerType, ReviewerId>> = {
  [ReviewerType.QA]: 'qa',
  [ReviewerType.UX]: 'ux',
  [ReviewerType.MARKETING]: 'marketing',
  [ReviewerType.INVESTOR]: 'investor',
  [ReviewerType.JUDGE]: 'judge',
  [ReviewerType.FIRST_USER]: 'first-user',
};

const isPriorityFix = (value: unknown): value is PriorityFix => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    typeof v.description === 'string' &&
    (v.effort === 'low' || v.effort === 'medium' || v.effort === 'high') &&
    (v.impact === 'low' || v.impact === 'medium' || v.impact === 'high')
  );
};

const parsePriorityFixes = (raw: unknown): PriorityFix[] => {
  if (!Array.isArray(raw)) return [];
  const out: PriorityFix[] = [];
  for (const item of raw) {
    if (isPriorityFix(item)) out.push(item);
  }
  return out;
};

const parseEvidence = (raw: unknown): EvidenceBundle | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  // We trust the schema at the application boundary; for
  // this task we just pass the JSON through. A future task
  // can layer a Zod-validated parser if evidence sources
  // need to be strictly validated on read.
  return raw as EvidenceBundle;
};

/**
 * Build a `ReviewerOutput` from a persisted `ReviewerResult`
 * row, so the verdict engine can re-derive the rich verdict
 * on read.
 */
const buildReviewerOutput = (
  reviewer: ReviewerId,
  score: number,
  confidence: number,
  summary: string,
  strengths: string[],
  weaknesses: string[],
  priorityFixes: PriorityFix[],
): ReviewerOutput => ({
  reviewer,
  score,
  confidence,
  summary,
  strengths,
  weaknesses,
  priorityFixes,
  schemaVersion: 1,
});

/* -------------------------------------------------------------------------- */
/* Loader                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Load a review session and project it to the stable wire shape.
 * Returns `null` when the session id does not exist. Throws on
 * database errors — callers map that to a 500.
 */
export const loadReviewWirePayload = async (id: string): Promise<ReviewWirePayload | null> => {
  // 1. Load the session with the reviewer results in one query.
  const session = await prisma.reviewSession.findUnique({
    where: { id },
    include: {
      reviewerResults: {
        orderBy: { createdAt: 'asc' },
      },
      result: true,
    },
  });

  if (!session) {
    return null;
  }

  // 2. Project the reviewer results to the wire shape.
  const reviewerResults: WireReviewerResult[] = session.reviewerResults.map((row) => {
    const reviewerId = REVIEWER_TYPE_TO_ID[row.reviewer];
    const priorityFixes = parsePriorityFixes(row.priorityFixes);
    // A reviewer is "failed" if the persisted row is the
    // failure placeholder the pipeline writes on a throw —
    // i.e. score = 0, confidence = 0, summary mentions the
    // failure. We re-derive this here so the wire shape is
    // self-describing without leaking the failure text.
    const failed = row.score === 0 && row.confidence === 0;
    return {
      id: row.id,
      reviewer: reviewerId,
      reviewerRole: REVIEWER_ROLES[reviewerId],
      score: row.score,
      confidence: row.confidence,
      summary: row.summary,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      priorityFixes,
      failed,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  // 3. Project the verdict (if any) to the wire shape.
  //
  //    We re-derive the rich `Verdict` object from the
  //    persisted reviewer results on every read. The verdict
  //    engine is pure and fast; the only thing the database
  //    owns is the (overallScore, status, summary) triple,
  //    which serves as the source of truth that the verdict
  //    has been computed. The richer fields (topStrengths,
  //    topWeaknesses, priorityFixes) are derived.
  let verdict: WireVerdict | null = null;
  if (session.result) {
    const row = session.result;
    const outputs: ReviewerOutput[] = session.reviewerResults.map((r) => {
      const reviewerId = REVIEWER_TYPE_TO_ID[r.reviewer];
      return buildReviewerOutput(
        reviewerId,
        r.score,
        r.confidence,
        r.summary,
        r.strengths,
        r.weaknesses,
        parsePriorityFixes(r.priorityFixes),
      );
    });
    // The verdict engine is the source of truth for the
    // rich verdict shape. Use its `headline` and `summary`
    // (which include the per-reviewer breakdown) instead
    // of the `headline + body` composite we wrote to the DB.
    const derived = computeVerdict(outputs);
    verdict = {
      overallScore: derived.overallScore,
      status: parseStatus(row.verdict),
      headline: derived.headline,
      summary: derived.summary,
      topStrengths: derived.topStrengths,
      topWeaknesses: derived.topWeaknesses,
      priorityFixes: derived.priorityFixes,
    };
  }

  // 4. Assemble the payload.
  return {
    session: {
      id: session.id,
      type: session.type,
      status: session.status,
      target: session.target,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    evidence: parseEvidence(session.evidence),
    reviewerResults,
    verdict,
  };
};
