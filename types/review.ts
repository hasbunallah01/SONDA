/**
 * types/review — Cross-feature types for reviews, sessions, and verdicts.
 */

import type { EvidenceBundle } from './evidence';
import type { ReviewerId, ReviewerOutput } from '@/agents/types';

export type ReviewStatus = 'pending' | 'collecting' | 'reviewing' | 'verdict' | 'done' | 'failed';

export type VerdictStatus = 'ready' | 'almost' | 'needs-work' | 'not-ready';

export type Verdict = {
  overallScore: number; // 0–100
  status: VerdictStatus;
  headline: string;
  summary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  priorityFixes: { title: string; description: string; effort: string; impact: string }[];
  reviewerOutputs: ReviewerOutput[];
};

export type ReviewSession = {
  id: string;
  status: ReviewStatus;
  evidence: EvidenceBundle;
  reviewerOutputs: ReviewerOutput[];
  verdict?: Verdict;
  createdAt: string;
  updatedAt: string;
};

export type ReviewProgressEvent = {
  reviewId: string;
  at: string;
  stage:
    | 'preparing'
    | 'collecting-evidence'
    | 'building-bundle'
    | 'qa'
    | 'ux'
    | 'marketing'
    | 'investor'
    | 'judge'
    | 'first-user'
    | 'verdict'
    | 'done';
  message: string;
  reviewer?: ReviewerId;
};
