/**
 * agents/qa/persistence — persist the QA reviewer's `ReviewerResult` row.
 *
 * Task 6.3.3 — QA Reviewer. This module is the only place the
 * QA agent touches the `reviewer_results` table. Reviewers
 * themselves stay pure with respect to `ReviewerContext` (see
 * `agents/contract.ts#Reviewer.run`); persistence is the
 * orchestrator's responsibility, which means it lives in a
 * small, testable helper that the future reviewer-registry
 * task can wire into the orchestrator.
 *
 * Why a separate file?
 *  - Keeps the reviewer module (`agents/qa/index.ts`) focused
 *    on analysis and output shape.
 *  - Lets unit tests exercise the upsert path against a real
 *    (or mocked) Prisma client without dragging the whole
 *    reviewer in.
 *  - Centralizes the `ReviewerId` → `ReviewerType` enum
 *    mapping so adding a new reviewer is a one-line change.
 *
 * Out of scope
 *  - No retries. The orchestrator owns retry policy.
 *  - No transactions. A single `upsert` is atomic by itself;
 *    a future task can wrap multi-row writes if needed.
 */

import { prisma, ReviewerType } from '@/lib/db';
import type {
  PriorityFix,
  ReviewerId,
  ReviewerResultInput,
  ReviewerResultRow,
} from '@/agents/types';

/* -------------------------------------------------------------------------- */
/* Enum mapping                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Application-side `ReviewerId` → Prisma `ReviewerType` enum.
 *
 * Mirrors the reverse direction defined on the `ReviewerType`
 * enum in `prisma/schema.prisma`. The mapping is exhaustive
 * over the `ReviewerId` union, so TypeScript will fail the
 * build if a new reviewer id is added without registering
 * its enum value here.
 */
const REVIEWER_TYPE_MAP: Readonly<Record<ReviewerId, ReviewerType>> = {
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
 * Upsert a single `ReviewerResult` row for `input.sessionId`
 * and `input.reviewer`.
 *
 * The Prisma model has a compound unique key on
 * `(sessionId, reviewer)` (see `prisma/schema.prisma`), so a
 * re-run of the same reviewer on the same session updates
 * the existing row in place rather than throwing on conflict.
 * This is the only valid behavior — exactly one `ReviewerResult`
 * per juror per session is a database-level invariant.
 *
 * @param input  the same shape `prisma.reviewerResult.create`
 *               would accept, but typed against the application
 *               `ReviewerId` / `PriorityFix` so callers do not
 *               need to import from `@prisma/client`.
 * @returns the persisted row, projected back to the
 *          application-side `ReviewerResultRow` shape.
 */
export async function saveReviewerResult(input: ReviewerResultInput): Promise<ReviewerResultRow> {
  return saveQaReviewerResult(input);
}

/**
 * Canonical per-reviewer alias. Other reviewers expose
 * `save<Name>ReviewerResult`; QA originally exposed
 * `saveReviewerResult` (no `Qa` prefix). Both names point at
 * the same implementation so callers can use a consistent
 * naming convention.
 */
export async function saveQaReviewerResult(input: ReviewerResultInput): Promise<ReviewerResultRow> {
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
      // `Json` columns in Prisma are typed as `Prisma.InputJsonValue`;
      // `PriorityFix[]` is structurally compatible (objects with
      // string fields and a string-literal union for `effort` /
      // `impact`) and we wrote it ourselves above, so a single
      // cast is safe and avoids leaking the `Prisma.*` types
      // into the rest of the agents layer.
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
    // The column is `Json` on the Prisma side, which round-trips
    // as `Prisma.JsonValue`. We wrote a `PriorityFix[]` and the
    // shape is stable, so cast back to the application type.
    priorityFixes: row.priorityFixes as unknown as PriorityFix[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
