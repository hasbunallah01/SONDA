/**
 * agents/first-user — First-time User reviewer
 *
 * Placeholder. Real implementation lands in the next phase.
 */

import type { ReviewerContext, ReviewerOutput } from '../types';

export const REVIEWER_ID = 'first-user' as const;

export async function runFirstUserReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return {
    reviewer: 'first-user',
    score: 0,
    confidence: 0,
    summary: 'First-user reviewer not yet implemented.',
    strengths: [],
    weaknesses: [],
    priorityFixes: [],
    schemaVersion: 1,
  };
}
