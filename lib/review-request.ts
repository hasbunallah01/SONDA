/**
 * lib/review-request.ts — Shared request validation for review intake.
 *
 * Extracted from `app/api/reviews/route.ts` so both the web intake
 * route (`POST /api/reviews`) and the agent-facing ASP route
 * (`POST /api/asp/review`) validate the exact same wire format.
 * Pure move — no behavior change.
 */

import { z } from 'zod';

import { ReviewType } from '@/lib/db';

/**
 * `type` is accepted in the same shape the frontend already uses
 * (lowercase, matching `types/evidence.ts#ReviewSource`). We map it to
 * the Prisma `ReviewType` enum inside the handlers so the wire format
 * stays decoupled from the database schema.
 */
export const reviewTypeValues = ['website', 'github', 'zip', 'private'] as const;

export const createReviewSchema = z.object({
  type: z.enum(reviewTypeValues, {
    errorMap: () => ({
      message: `type must be one of: ${reviewTypeValues.join(', ')}`,
    }),
  }),
  /**
   * Optional credentials for `type: "private"` reviews. Forwarded
   * to the evidence collector via the orchestrator's
   * `RunReviewOptions.privateCredentials` field. All four fields
   * are optional; the collector applies HTTP Basic Auth when
   * both `username` and `password` are supplied.
   */
  username: z.string().min(1).max(256).optional(),
  password: z.string().min(1).max(256).optional(),
  twoFactorCode: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000).optional(),
  /**
   * `target` is whatever the user submitted:
   *   - WEBSITE / PRIVATE_WEBSITE → URL.
   *   - GITHUB                    → repo URL.
   *   - ZIP                       → upload reference.
   *
   * We only enforce a non-empty, reasonable length here. Per-source
   * validation (URL parsing, GitHub regex, file presence) belongs in
   * the source's own feature module, not at the API boundary.
   */
  target: z
    .string({ required_error: 'target is required' })
    .trim()
    .min(1, 'target is required')
    .max(2048, 'target is too long (max 2048 characters)'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

/**
 * Translate the wire-level review type into the Prisma enum. Centralized
 * here so adding a new source = one place to touch.
 */
export const toPrismaReviewType = (input: CreateReviewInput['type']): ReviewType => {
  switch (input) {
    case 'website':
      return ReviewType.WEBSITE;
    case 'github':
      return ReviewType.GITHUB;
    case 'zip':
      return ReviewType.ZIP;
    case 'private':
      return ReviewType.PRIVATE_WEBSITE;
  }
};
