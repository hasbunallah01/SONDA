/**
 * agents/marketing — Marketing / GTM Expert reviewer
 *
 * Placeholder. Real implementation lands in the next phase.
 */

import type { ReviewerContext, ReviewerOutput } from '../types';

export const REVIEWER_ID = 'marketing' as const;

export async function runMarketingReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return {
    reviewer: 'marketing',
    score: 0,
    confidence: 0,
    summary: 'Marketing reviewer not yet implemented.',
    strengths: [],
    weaknesses: [],
    priorityFixes: [],
    schemaVersion: 1,
  };
}
