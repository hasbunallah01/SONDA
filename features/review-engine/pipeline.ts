/**
 * features/review-engine/pipeline — Top-level review pipeline composer
 *
 * Task 6.19 — Pipeline Composer.
 *
 * One function: `runReviewPipeline(session)` does the entire
 * content lifecycle for a `ReviewSession`:
 *
 *   1. Collect evidence (per source type).
 *   2. Persist the evidence on the `ReviewSession` row.
 *   3. Run every registered reviewer.
 *   4. Persist each `ReviewerResult`.
 *   5. Compute the verdict.
 *   6. Persist the `ReviewResult`.
 *
 * The status transitions are owned by `services/review-orchestrator.ts`
 * — this module runs *inside* the RUNNING state and never
 * touches the `ReviewStatus` column. The orchestrator marks
 * the session COMPLETED or FAILED based on whether this
 * function returns or throws.
 *
 * Distinct from `services/review-orchestrator.ts`:
 *   - The orchestrator drives the **session lifecycle**
 *     (PENDING → RUNNING → COMPLETED / FAILED).
 *   - This module drives the **content lifecycle** (collect
 *     evidence → run reviewers → compute verdict).
 *
 * Distinct from `services/run-review.ts`:
 *   - `run-review.ts` is the **verdict + reviewer** pipeline
 *     and assumes the evidence has already been collected and
 *     saved.
 *   - This module **includes** the evidence-collection step
 *     and is the top-level entry point.
 *
 * Public API
 *   - `runReviewPipeline(session, options?)` — runs the entire
 *     content pipeline. Returns the persisted verdict + the
 *     reviewer pipeline result.
 *   - `RunReviewPipelineOptions` — optional credentials for
 *     private-website reviews.
 */

import { prisma, ReviewType, type Prisma } from '@/lib/db';
import type { EvidenceBundle } from '@/types/evidence';
import { runReviewSession, type RunReviewSessionResult } from '@/services/run-review';
import { collectWebsiteEvidence } from '@/features/website-review/collect';
import { collectGithubEvidence } from '@/features/github-review/collect';
import { collectZipEvidence } from '@/features/zip-review/collect';
import {
  collectPrivateWebsiteEvidence,
  type PrivateWebsiteCredentials,
} from '@/features/private-review/collect';

export type RunReviewPipelineOptions = {
  privateCredentials?: PrivateWebsiteCredentials;
};

/**
 * The full session row the orchestrator hands in. We use the
 * `Prisma.ReviewSessionGetPayload<{}>` shape so the result
 * relation does not need to be eagerly loaded.
 */
export type PipelineSession = Prisma.ReviewSessionGetPayload<Record<string, never>>;

export type ReviewPipelineResult = RunReviewSessionResult & {
  /** The evidence bundle that was collected and persisted. */
  evidence: EvidenceBundle;
};

/* -------------------------------------------------------------------------- */
/* Logging                                                                    */
/* -------------------------------------------------------------------------- */

const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  const payload = context ? ` ${JSON.stringify(context)}` : '';
  const line = `[review-pipeline] ${message}${payload}`;
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
/* Evidence collection                                                        */
/* -------------------------------------------------------------------------- */

const collectEvidence = async (
  session: PipelineSession,
  options: RunReviewPipelineOptions,
): Promise<EvidenceBundle> => {
  if (!session.target || session.target.trim().length === 0) {
    throw new PipelineError('missing-target', `Session ${session.id} has no target.`);
  }

  switch (session.type) {
    case ReviewType.WEBSITE:
      return collectWebsiteEvidence(session.target);
    case ReviewType.GITHUB:
      return collectGithubEvidence(session.target);
    case ReviewType.ZIP:
      return collectZipEvidence(session.target);
    case ReviewType.PRIVATE_WEBSITE:
      return collectPrivateWebsiteEvidence(session.target, options.privateCredentials);
    default: {
      // Exhaustiveness: a new ReviewType added to the schema
      // without a matching collector lands here at compile time.
      const _exhaustive: never = session.type;
      void _exhaustive;
      throw new PipelineError(
        'unknown-type',
        `No evidence collector registered for review type ${String(session.type)}.`,
      );
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Pipeline error                                                             */
/* -------------------------------------------------------------------------- */

export type PipelineErrorCode =
  'missing-target' | 'unknown-type' | 'collector-failed' | 'persist-failed' | 'pipeline-failed';

export class PipelineError extends Error {
  public readonly code: PipelineErrorCode;
  public override readonly cause?: unknown;

  constructor(code: PipelineErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Top-level entry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Run the full content pipeline for a single `ReviewSession`.
 *
 * Steps
 *   1. Collect evidence (per `session.type`).
 *   2. Persist evidence on the session row.
 *   3. Run every registered reviewer.
 *   4. Compute the verdict and persist it.
 *
 * Throws `PipelineError` on any unrecoverable failure. The
 * caller (the session orchestrator) is responsible for
 * transitioning the session to FAILED.
 */
export const runReviewPipeline = async (
  session: PipelineSession,
  options: RunReviewPipelineOptions = {},
): Promise<ReviewPipelineResult> => {
  // 1. Collect evidence.
  let evidence: EvidenceBundle;
  try {
    evidence = await collectEvidence(session, options);
  } catch (error) {
    throw new PipelineError(
      'collector-failed',
      `Evidence collector for ${session.type} failed: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
      error,
    );
  }
  log('info', 'evidence collected', {
    sessionId: session.id,
    type: session.type,
    source: evidence.metadata.source,
  });

  // 2. Persist evidence on the session.
  try {
    await prisma.reviewSession.update({
      where: { id: session.id },
      data: {
        evidence: evidence as unknown as Parameters<
          typeof prisma.reviewSession.update
        >[0]['data']['evidence'],
      },
    });
  } catch (error) {
    throw new PipelineError(
      'persist-failed',
      `Failed to persist evidence on session ${session.id}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
      error,
    );
  }

  // 3 & 4. Run reviewers + verdict (services/run-review.ts).
  try {
    const result = await runReviewSession(session.id, evidence);
    return { ...result, evidence };
  } catch (error) {
    throw new PipelineError(
      'pipeline-failed',
      `Reviewer / verdict pipeline failed for session ${session.id}: ${
        error instanceof Error ? error.message : 'unknown'
      }`,
      error,
    );
  }
};
