/**
 * agents/qa — QA Engineer reviewer
 *
 * Placeholder. Real implementation lands in the next phase.
 */

import type { ReviewerContext, ReviewerOutput } from '../types';

export const REVIEWER_ID = 'qa' as const;

export async function runQaReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return {
    reviewer: 'qa',
    score: 0,
    confidence: 0,
    summary: 'QA reviewer not yet implemented.',
    strengths: [],
    weaknesses: [],
    priorityFixes: [],
    schemaVersion: 1,
  };
}
