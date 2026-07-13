/**
 * agents/types — Shared types for all reviewer agents.
 *
 * Concrete implementation lands in the next phase; this is the contract every
 * agent must satisfy so the verdict engine can plug them in interchangeably.
 */

import type { EvidenceBundle } from '@/types/evidence';

export type ReviewerId = 'qa' | 'ux' | 'marketing' | 'investor' | 'judge' | 'first-user';

export type ReviewerContext = {
  evidence: EvidenceBundle;
  // Future: prior reviewer outputs, calibration data, runId, etc.
};

export type PriorityFix = {
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
};

export type ReviewerOutput = {
  reviewer: ReviewerId;
  score: number; // 0–100
  confidence: number; // 0–1
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
};
