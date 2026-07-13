/**
 * agents/judge — Hackathon Judge reviewer
 *
 * Placeholder. Real implementation lands in the next phase.
 */

import type { ReviewerContext, ReviewerOutput } from '../types';

export const REVIEWER_ID = 'judge' as const;

export async function runJudgeReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return {
    reviewer: 'judge',
    score: 0,
    confidence: 0,
    summary: 'Judge reviewer not yet implemented.',
    strengths: [],
    weaknesses: [],
    priorityFixes: [],
    schemaVersion: 1,
  };
}
