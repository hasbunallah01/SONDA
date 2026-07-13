/**
 * services/run-review.ts — Top-level review pipeline
 *
 * Task 6.14 — Pipeline composer.
 *
 * Composes the reviewer pipeline (`services/reviewers.ts`) and
 * the verdict engine (`services/verdict.ts`) into a single
 * entry point. The session-level orchestrator's handler
 * (per-source) is the intended caller; it will collect an
 * `EvidenceBundle` from the source-specific collector and then
 * invoke `runReviewSession(sessionId, evidence)` to drive the
 * full pipeline.
 *
 * Pipeline
 *   1. Run every registered reviewer against the evidence.
 *   2. Persist each `ReviewerResult` row (done inside the
 *      reviewer pipeline).
 *   3. Compute the verdict and persist the `ReviewResult` row.
 *   4. Return the verdict + the per-reviewer outputs.
 *
 * Distinct from `services/review-orchestrator.ts`:
 *   - That module drives the *session lifecycle* (PENDING →
 *     RUNNING → COMPLETED / FAILED). It is the wrapper.
 *   - This module drives the *content lifecycle* (run the
 *     reviewers + compute the verdict). It is the inner work.
 *
 * The two are designed to compose: a future evidence-collector-
 * backed handler will be the glue between them.
 *
 * Public API
 *   - `runReviewSession(sessionId, evidence)` — runs the full
 *     pipeline and returns the verdict + per-reviewer outputs.
 *   - `runReviewSessionResult` — the return shape.
 */

import type { ReviewerOutput } from '@/agents/types';
import type { EvidenceBundle } from '@/types/evidence';
import type { Verdict } from '@/types/review';

import { runReviewerPipeline, type ReviewerPipelineResult } from '@/services/reviewers';
import { saveVerdict, type PersistedVerdict } from '@/services/verdict';

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type RunReviewSessionResult = {
  /** The `ReviewSession.id` the pipeline ran for. */
  sessionId: string;
  /** The pipeline's per-reviewer outcomes. */
  pipeline: ReviewerPipelineResult;
  /** The persisted verdict. */
  persistedVerdict: PersistedVerdict;
  /** Convenience: the per-reviewer outputs. */
  outputs: ReadonlyArray<ReviewerOutput>;
  /** Convenience: the computed `Verdict`. */
  verdict: Verdict;
};

/* -------------------------------------------------------------------------- */
/* Top-level entry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Run the full review pipeline for a session: every registered
 * reviewer, then the verdict engine, then persist.
 *
 * @param sessionId  the `ReviewSession.id` to drive.
 * @param evidence   the `EvidenceBundle` the reviewers will score.
 * @returns the pipeline result, the persisted verdict, and the
 *          per-reviewer outputs.
 */
export const runReviewSession = async (
  sessionId: string,
  evidence: EvidenceBundle,
): Promise<RunReviewSessionResult> => {
  // 1. Run the reviewer pipeline. Persists each result.
  const pipeline = await runReviewerPipeline(sessionId, evidence);

  // 2. Compute and persist the verdict from the outputs.
  const persistedVerdict = await saveVerdict(sessionId, pipeline.outputs);

  return {
    sessionId,
    pipeline,
    persistedVerdict,
    outputs: pipeline.outputs,
    verdict: persistedVerdict.verdict,
  };
};
