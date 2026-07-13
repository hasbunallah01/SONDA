/**
 * agents/ux/persistence — persist the UX Designer's `ReviewerResult` row.
 *
 * Mirrors `agents/qa/persistence.ts` 1-to-1. Each reviewer owns the
 * file that writes *its own* `ReviewerResult` row so the orchestrator
 * can stay reviewer-agnostic and so the `ReviewerId` → `ReviewerType`
 * enum mapping is owned by the reviewer layer (see
 * `agents/qa/persistence.ts#REVIEWER_TYPE_MAP` for the canonical
 * map). Adding a new reviewer = one new persistence file.
 *
 * Out of scope
 *  - No retries. The orchestrator owns retry policy.
 *  - No transactions. A single `upsert` is atomic by itself;
 *    a future task can wrap multi-row writes if needed.
 */

import { prisma, ReviewerType } from '@/lib/db';
import type { PriorityFix, ReviewerResultInput, ReviewerResultRow } from '@/agents/types';

/* -------------------------------------------------------------------------- */
/* Enum mapping                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Application-side `ReviewerId` → Prisma `ReviewerType` enum.
 *
 * Mirrors the QA reviewer. Kept here so this file is self-contained
 * and a unit test can import it without crossing the QA module.
 */
const REVIEWER_TYPE_MAP: Readonly<Record<ReviewerResultInput['reviewer'], ReviewerType>> = {
  qa: ReviewerType.QA,
  ux: ReviewerType.UX,
  marketing: ReviewerType.MARKETING,
  investor: ReviewerType.INVESTOR,
  judge: ReviewerType.JUDGE,
  'first-user': ReviewerType.FIRST_USER,
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Upsert a single `ReviewerResult` row for the UX reviewer.
 *
 * The Prisma model has a compound unique key on
 * `(sessionId, reviewer)`, so a re-run updates the existing row
 * in place rather than throwing on conflict. Exactly one
 * `ReviewerResult` per juror per session is a database-level
 * invariant.
 *
 * @param input the same shape `prisma.reviewerResult.create` would
 *              accept, but typed against the application
 *              `ReviewerId` / `PriorityFix` so callers do not need
 *              to import from `@prisma/client`.
 * @returns the persisted row, projected back to the
 *          application-side `ReviewerResultRow` shape.
 */
export async function saveUxReviewerResult(input: ReviewerResultInput): Promise<ReviewerResultRow> {
  const reviewerEnum = REVIEWER_TYPE_MAP[input.reviewer];

  const row = await prisma.reviewerResult.upsert({
    where: {
      sessionId_reviewer: {
        sessionId: input.sessionId,
        reviewer: reviewerEnum,
      },
    },
    create: {
      sessionId: input.sessionId,
      reviewer: reviewerEnum,
      score: input.score,
      confidence: input.confidence,
      summary: input.summary,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      priorityFixes: input.priorityFixes as unknown as Parameters<
        typeof prisma.reviewerResult.create
      >[0]['data']['priorityFixes'],
    },
    update: {
      score: input.score,
      confidence: input.confidence,
      summary: input.summary,
      strengths: input.strengths,
      weaknesses: input.weaknesses,
      priorityFixes: input.priorityFixes as unknown as Parameters<
        typeof prisma.reviewerResult.create
      >[0]['data']['priorityFixes'],
    },
  });

  return {
    id: row.id,
    sessionId: row.sessionId,
    reviewer: input.reviewer,
    score: row.score,
    confidence: row.confidence,
    summary: row.summary,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    priorityFixes: row.priorityFixes as unknown as PriorityFix[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
