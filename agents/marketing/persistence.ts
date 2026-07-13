/**
 * agents/marketing/persistence — persist the Marketing reviewer's row.
 *
 * Mirrors `agents/qa/persistence.ts` and `agents/ux/persistence.ts`.
 * Each reviewer owns the file that writes *its own*
 * `ReviewerResult` row so the orchestrator can stay
 * reviewer-agnostic and the `ReviewerId` → `ReviewerType` enum
 * mapping is owned by the reviewer layer. Adding a new reviewer
 * = one new persistence file.
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
 * Upsert a single `ReviewerResult` row for the Marketing reviewer.
 *
 * Compound unique key on `(sessionId, reviewer)` makes "one row
 * per juror per session" a database-level invariant; a re-run
 * updates the existing row in place rather than throwing on
 * conflict.
 */
export async function saveMarketingReviewerResult(
  input: ReviewerResultInput,
): Promise<ReviewerResultRow> {
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
