/**
 * app/api/reviews/[id]/route.ts — GET /api/reviews/:id
 *
 * Task 6.13 — Results API.
 *
 * Returns the full state of a `ReviewSession`:
 *
 *   - `session.status`     — PENDING / RUNNING / COMPLETED / FAILED
 *   - `session.type`       — WEBSITE / GITHUB / ZIP / PRIVATE_WEBSITE
 *   - `session.target`     — the user-supplied URL or artifact reference
 *   - `session.createdAt` / `updatedAt`
 *   - `session.evidence`   — the persisted `EvidenceBundle`, or `null`
 *                            if no collector has produced one yet
 *   - `reviewerResults`    — one row per juror in the panel
 *                            (score, confidence, summary, strengths,
 *                            weaknesses, priorityFixes, failed flag)
 *   - `verdict`            — the final `Verdict` (overallScore, status,
 *                            headline, summary, topStrengths,
 *                            topWeaknesses, priorityFixes), or `null`
 *                            if the verdict has not been computed yet
 *
 * HTTP status
 *   - 200 — session found; `verdict` may be `null` if the pipeline
 *           has not finished yet.
 *   - 404 — session id does not exist.
 *   - 405 — wrong method.
 *   - 500 — unexpected server error.
 *
 * Out of scope
 *   - No auth (the user knows the cuid; cuid entropy is the
 *     access control for this task).
 *   - No side effects. The GET is a pure read.
 */

import { NextResponse } from 'next/server';

import { prisma, ReviewerType } from '@/lib/db';
import { isProduction } from '@/lib/env';
import type { PriorityFix, ReviewerId, ReviewerOutput } from '@/agents/types';
import { REVIEWER_ROLES } from '@/agents/types';
import { computeVerdict } from '@/features/verdict-engine';
import type { EvidenceBundle } from '@/types/evidence';
import type { Verdict } from '@/types/review';

/* -------------------------------------------------------------------------- */
/* Route context                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Next.js 14 App Router hands every route handler a context
 * object whose shape depends on the route's dynamic segments.
 * We destructure `params` from it and read the `id` segment
 * our own way so the handler signature stays small.
 */
type RouteContext = {
  params: { id: string };
};

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
type WireReviewerResult = {
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
type WireVerdict = Omit<Verdict, 'reviewerOutputs'> & {
  reviewerOutputs?: never;
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

const errorResponse = (message: string, status: number, details?: unknown): NextResponse =>
  NextResponse.json(
    {
      error: {
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );

/* -------------------------------------------------------------------------- */
/* Route handler                                                              */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/reviews/:id
 *
 * Returns the full review session. The shape is stable:
 * `session` is always present (404 otherwise), `verdict` is
 * `null` if the verdict has not been computed yet, and
 * `reviewerResults` is an empty array if no reviewer has run.
 */
export const GET = async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const { id } = context.params;

  if (!id || typeof id !== 'string') {
    return errorResponse('Review session id is required.', 400);
  }

  try {
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
      return errorResponse(`Review session ${id} not found.`, 404);
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

    // 4. Assemble the response.
    return NextResponse.json(
      {
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
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/reviews/:id] failed to load review', error);

    const message = isProduction
      ? 'Failed to load review session.'
      : error instanceof Error
        ? `Failed to load review session: ${error.message}`
        : 'Failed to load review session.';

    return errorResponse(message, 500);
  }
};

/**
 * Reject every other verb explicitly so callers get a clean 405.
 */
export const POST = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PUT = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PATCH = (): NextResponse => errorResponse('Method not allowed.', 405);
export const DELETE = (): NextResponse => errorResponse('Method not allowed.', 405);
