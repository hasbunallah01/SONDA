/**
 * services/reviewers.ts — Reviewer pipeline orchestrator
 *
 * Task 6.10 — Reviewer Orchestrator.
 *
 * Runs every registered reviewer against a single `ReviewSession`'s
 * `EvidenceBundle` and persists the resulting `ReviewerResult` rows
 * via each reviewer's persistence helper. Returns the full list
 * of `ReviewerOutput`s so the verdict engine (and the results
 * API) can use them without re-reading from the database.
 *
 * Distinct from `services/review-orchestrator.ts`:
 *  - `services/review-orchestrator.ts` is the *session-level*
 *    orchestrator: it drives a `ReviewSession` through
 *    PENDING → RUNNING → COMPLETED / FAILED.
 *  - This module is the *reviewer-level* orchestrator: it takes
 *    a session id + an evidence bundle and runs the agent jury.
 *
 *    The session-level orchestrator's handler (the per-source
 *    placeholder, or a future evidence-collector-backed one) is
 *    what calls into this module.
 *
 * Public API
 *   - `runReviewerPipeline(sessionId, evidence)` — runs every
 *     reviewer and persists the result. Returns the outputs.
 *   - `runReviewerPipelineFromSession(sessionId, evidence)` —
 *     convenience wrapper that loads the session row and runs
 *     the pipeline.
 *
 * Errors
 *   - Failures inside an individual reviewer are captured into
 *     the per-reviewer output (score = 0, confidence = 0,
 *     summary describes the failure). They do NOT throw out of
 *     the pipeline. The verdict engine will see a `failed`
 *     row in the inputs and the results API will surface the
 *     error in the response.
 */

import { randomUUID } from 'node:crypto';

import { reviewerRegistry } from '@/agents/registry';
import type {
  ReviewerContext,
  ReviewerError,
  ReviewerId,
  ReviewerOutput,
  ReviewerResultInput,
  ReviewerResultRow,
} from '@/agents/types';
import { prisma } from '@/lib/db';
import { isProduction } from '@/lib/env';
import type { EvidenceBundle } from '@/types/evidence';

import { saveQaReviewerResult } from '@/agents/qa/persistence';
import { saveUxReviewerResult } from '@/agents/ux/persistence';
import { saveMarketingReviewerResult } from '@/agents/marketing/persistence';
import { saveInvestorReviewerResult } from '@/agents/investor/persistence';
import { saveJudgeReviewerResult } from '@/agents/judge/persistence';
import { saveFirstUserReviewerResult } from '@/agents/first-user/persistence';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The outcome of a single reviewer invocation.
 *
 * `failed: true` means the reviewer threw or produced a parse
 * error. The `output` is still populated (with a score of 0
 * and a short failure summary) so downstream consumers — the
 * verdict engine and the results API — see a stable shape
 * regardless of the run's success.
 */
export type ReviewerRunOutcome = {
  /** The id of the reviewer that produced this outcome. */
  reviewer: ReviewerId;
  /** The structured output the reviewer produced. */
  output: ReviewerOutput;
  /** Persisted DB row id (cuid). Empty string if persistence itself failed. */
  rowId: string;
  /** True if the reviewer threw or produced a parse-error. */
  failed: boolean;
  /** The error, if `failed === true`. */
  error?: ReviewerError;
};

/**
 * The full result of a single `runReviewerPipeline` call.
 */
export type ReviewerPipelineResult = {
  sessionId: string;
  /** Outcomes in the order reviewers ran. */
  outcomes: ReadonlyArray<ReviewerRunOutcome>;
  /** Convenience: every output (failed or successful). */
  outputs: ReadonlyArray<ReviewerOutput>;
  /** Convenience: count of reviewers that failed. */
  failureCount: number;
  /** Convenience: count of reviewers that completed. */
  successCount: number;
};

/* -------------------------------------------------------------------------- */
/* Per-reviewer persistence dispatch                                          */
/* -------------------------------------------------------------------------- */

/**
 * Map from `ReviewerId` to its dedicated persistence helper.
 *
 * Each reviewer owns the file that writes *its own* row, so this
 * table is the single place we map `ReviewerId` → helper. Adding
 * a new reviewer = one new entry here.
 */
const PERSISTENCE_DISPATCH: Readonly<
  Record<ReviewerId, (input: ReviewerResultInput) => Promise<ReviewerResultRow>>
> = {
  qa: saveQaReviewerResult,
  ux: saveUxReviewerResult,
  marketing: saveMarketingReviewerResult,
  investor: saveInvestorReviewerResult,
  judge: saveJudgeReviewerResult,
  'first-user': saveFirstUserReviewerResult,
};

/**
 * Save a `ReviewerOutput` to the `reviewer_results` table via
 * the matching reviewer's persistence helper. `sessionId` is
 * taken from the parameter, not the output, because the
 * `ReviewerOutput` contract does not require it.
 */
const persistReviewerOutput = async (
  sessionId: string,
  output: ReviewerOutput,
): Promise<ReviewerResultRow> => {
  const helper = PERSISTENCE_DISPATCH[output.reviewer];
  return helper({
    sessionId,
    reviewer: output.reviewer,
    score: output.score,
    confidence: output.confidence,
    summary: output.summary,
    strengths: output.strengths,
    weaknesses: output.weaknesses,
    priorityFixes: [...output.priorityFixes],
  });
};

/* -------------------------------------------------------------------------- */
/* Logging helper                                                             */
/* -------------------------------------------------------------------------- */

const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  const payload = context ? ` ${JSON.stringify(context)}` : '';
  const line = `[reviewers] ${message}${payload}`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.info(line);
  }
};

/* -------------------------------------------------------------------------- */
/* Single-reviewer runner                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Run one reviewer, persist its output, and return the outcome.
 *
 * Errors are caught and turned into a `failed: true` outcome so
 * one bad reviewer does not abort the whole pipeline. The
 * verdict engine handles the case where a subset of reviewers
 * failed (it down-weights or omits those scores).
 */
const runOneReviewer = async (
  sessionId: string,
  evidence: EvidenceBundle,
  module: (typeof reviewerRegistry)[number],
): Promise<ReviewerRunOutcome> => {
  const reviewer = module.reviewer;
  const reviewerId = reviewer.id;
  const runId = randomUUID();
  const startedAt = Date.now();

  const ctx: ReviewerContext = {
    evidence,
    sessionId,
    reviewer: reviewerId,
    runId,
  };

  try {
    // 1. Run the reviewer. Throws on failure.
    const output = await reviewer.run(ctx);

    // 2. Persist the result.
    const row = await persistReviewerOutput(sessionId, {
      ...output,
      reviewer: reviewerId,
    });

    const endedAt = Date.now();
    log('info', 'reviewer completed', {
      sessionId,
      reviewer: reviewerId,
      durationMs: endedAt - startedAt,
      score: row.score,
    });

    return {
      reviewer: reviewerId,
      output: { ...output, reviewer: reviewerId },
      rowId: row.id,
      failed: false,
    };
  } catch (error) {
    const err: ReviewerError = {
      reviewer: reviewerId,
      kind: 'unknown',
      message: error instanceof Error ? error.message : 'Reviewer threw an unknown error.',
      retriable: false,
      cause: error,
    };

    log('warn', 'reviewer failed', { sessionId, reviewer: reviewerId, reason: err.message });

    // Persist a failure row so the results API can show what
    // happened. Use the persistence helper with score = 0 and a
    // short failure summary.
    const failureOutput: ReviewerOutput = {
      reviewer: reviewerId,
      score: 0,
      confidence: 0,
      summary: isProduction
        ? 'Reviewer failed to produce an output.'
        : `Reviewer failed: ${err.message}`,
      strengths: [],
      weaknesses: [`Reviewer failed: ${err.message}`],
      priorityFixes: [],
      schemaVersion: 1,
    };

    let rowId = '';
    try {
      const persisted = await persistReviewerOutput(sessionId, failureOutput);
      rowId = persisted.id;
    } catch (persistError) {
      log('error', 'failed to persist reviewer failure row', {
        sessionId,
        reviewer: reviewerId,
        reason: persistError instanceof Error ? persistError.message : 'unknown',
      });
    }

    return {
      reviewer: reviewerId,
      output: failureOutput,
      rowId,
      failed: true,
      error: err,
    };
  }
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run every registered reviewer against the supplied
 * `EvidenceBundle` and persist each result.
 *
 * The pipeline is sequential (deterministic ordering, easier
 * debugging). A future task can run reviewers in parallel where
 * safe — the per-reviewer persistence helpers are already
 * idempotent (`upsert`).
 *
 * @param sessionId  the `ReviewSession.id` the results belong to.
 * @param evidence   the `EvidenceBundle` the reviewers will score.
 * @returns the outcomes + the array of outputs (for the verdict
 *          engine and the results API).
 */
export const runReviewerPipeline = async (
  sessionId: string,
  evidence: EvidenceBundle,
): Promise<ReviewerPipelineResult> => {
  log('info', 'reviewer pipeline starting', {
    sessionId,
    reviewerCount: reviewerRegistry.length,
  });

  const outcomes: ReviewerRunOutcome[] = [];
  for (const entry of reviewerRegistry) {
    const outcome = await runOneReviewer(sessionId, evidence, entry);
    outcomes.push(outcome);
  }

  const successCount = outcomes.filter((o) => !o.failed).length;
  const failureCount = outcomes.length - successCount;

  log('info', 'reviewer pipeline finished', {
    sessionId,
    successCount,
    failureCount,
  });

  return {
    sessionId,
    outcomes,
    outputs: outcomes.map((o) => o.output),
    successCount,
    failureCount,
  };
};

/**
 * Load a `ReviewSession` row by id and run the reviewer
 * pipeline. Returns `null` if the session does not exist; the
 * caller (usually the session-level orchestrator or the API)
 * decides how to surface that.
 */
export const runReviewerPipelineFromSession = async (
  sessionId: string,
  evidence: EvidenceBundle,
): Promise<ReviewerPipelineResult | null> => {
  const session = await prisma.reviewSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    log('warn', 'session not found, skipping reviewer pipeline', { sessionId });
    return null;
  }
  return runReviewerPipeline(session.id, evidence);
};
