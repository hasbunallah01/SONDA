/**
 * agents/investor/persistence — persist the Investor reviewer's row.
 *
 * Mirrors `agents/qa/persistence.ts`, `agents/ux/persistence.ts`,
 * and `agents/marketing/persistence.ts`. Adding a new reviewer
 * = one new persistence file.
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

export async function saveInvestorReviewerResult(
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
