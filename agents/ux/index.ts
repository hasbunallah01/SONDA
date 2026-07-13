/**
 * agents/ux — UX Designer reviewer
 *
 * Placeholder. Real implementation lands in the next phase.
 */

import type { ReviewerContext, ReviewerOutput } from '../types';

export const REVIEWER_ID = 'ux' as const;

export async function runUxReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return {
    reviewer: 'ux',
    score: 0,
    confidence: 0,
    summary: 'UX reviewer not yet implemented.',
    strengths: [],
    weaknesses: [],
    priorityFixes: [],
    schemaVersion: 1,
  };
}
