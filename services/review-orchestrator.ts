/**
 * services/review-orchestrator.ts — Review Orchestrator (Foundation)
 *
 * Task 6.2 — Foundation. Drives a `ReviewSession` through the
 * lifecycle:
 *
 *   PENDING → RUNNING → COMPLETED   (success)
 *   PENDING → RUNNING → FAILED      (handler threw)
 *
 * Responsibilities
 *   1. Load a `ReviewSession` by id.
 *   2. Validate its current status (compare-and-swap on the row).
 *   3. Update the status atomically:
 *        PENDING → RUNNING
 *        RUNNING → COMPLETED
 *        RUNNING → FAILED
 *   4. Dispatch the review to the right type-specific handler.
 *   5. Catch handler errors, mark the session FAILED, and surface a
 *      structured result to the caller.
 *
 * Out of scope (per task)
 *   - Real evidence collection (Playwright, Lighthouse, axe-core,
 *     GitHub API, ZIP extraction, OpenAI, AI reviewers, verdict
 *     engine). Each review type has a *placeholder* handler that
 *     returns a small `ReviewHandlerResult`. The seam is in place;
 *     the actual collectors and agents land in later tasks.
 *   - Persisting a `ReviewResult` row. The verdict engine is a
 *     future task. For now `completeReview` only flips the status
 *     and the handler payload is returned to the caller for
 *     inspection (tests, API responses, etc.) but not yet written
 *     to the database.
 *   - Worker / queue dispatch. `runReview` runs in-process; the
 *     scheduled-task / queue worker lands with the runner task.
 *
 * Public API
 *   - `loadReviewSession(sessionId)`     — fetch a row.
 *   - `startReview(sessionId)`           — PENDING → RUNNING.
 *   - `completeReview(sessionId, result)` — RUNNING → COMPLETED.
 *   - `failReview(sessionId, reason)`    — RUNNING → FAILED.
 *   - `dispatchReviewHandler(session)`   — pick handler by type.
 *   - `runReview(sessionId)`             — full lifecycle, top-level entry.
 *
 *   The four placeholder handlers (`runWebsiteReview`,
 *   `runGithubReview`, `runZipReview`, `runPrivateWebsiteReview`)
 *   are exported so they can be replaced or composed in later tasks.
 *
 * Errors
 *   - `ReviewOrchestratorError` is thrown for invalid transitions.
 *     The `code` field distinguishes `NOT_FOUND` (row missing),
 *     `INVALID_STATUS` (wrong starting status), and `UNKNOWN_TYPE`
 *     (no handler registered for the row's `type`).
 */

import { prisma, ReviewType, ReviewStatus, type Prisma } from '@/lib/db';
import { isProduction } from '@/lib/env';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Full `ReviewSession` row the orchestrator operates on.
 *
 * `Prisma.ReviewSessionGetPayload<{}>` resolves to "all fields" —
 * every scalar plus the `result` relation. We use this in handlers
 * even though the `result` relation will usually be `null` at this
 * point in the lifecycle, so the type stays stable when the verdict
 * engine lands and the relation starts being populated.
 */
type ReviewSessionRow = Prisma.ReviewSessionGetPayload<Record<string, never>>;

/**
 * Result a placeholder handler returns.
 *
 * In later tasks the real handlers will produce an `EvidenceBundle`
 * and a list of `ReviewerOutput`s. The placeholder shape is
 * intentionally minimal — just enough to confirm the handler ran
 * and to record the future plan.
 */
export type ReviewHandlerResult = {
  /** Which placeholder handler produced this result. */
  readonly handler: 'website' | 'github' | 'zip' | 'private';
  /** Always `'completed'` for the placeholders. */
  readonly status: 'completed';
  /** Short human-readable summary. */
  readonly message: string;
  /** Free-form notes — useful for tests, logs, and the upcoming
   *  progress-event stream. */
  readonly notes: readonly string[];
};

/**
 * Discriminated union returned by `runReview`. Callers branch on
 * `ok` instead of inspecting the error.
 */
export type ReviewOrchestratorResult =
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly status: 'COMPLETED';
      readonly handler: ReviewHandlerResult;
    }
  | {
      readonly ok: false;
      readonly sessionId: string;
      readonly status: 'FAILED';
      readonly reason: string;
    };

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stable error codes for the orchestrator. Callers (e.g. the API
 * layer or the future queue worker) can map these to HTTP statuses
 * or retry policies without string matching on the error message.
 */
export type ReviewOrchestratorErrorCode = 'NOT_FOUND' | 'INVALID_STATUS' | 'UNKNOWN_TYPE';

export class ReviewOrchestratorError extends Error {
  public readonly code: ReviewOrchestratorErrorCode;

  constructor(message: string, code: ReviewOrchestratorErrorCode) {
    super(message);
    this.name = 'ReviewOrchestratorError';
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Logging helper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Single, consistent log line for the orchestrator.
 *
 * The session id is a cuid (no PII). The `target` is whatever the
 * user submitted and is *not* logged here — the real collectors
 * will need to redact credentials for the `private` type, which
 * is not in scope for this task.
 */
const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  const payload = context ? ` ${JSON.stringify(context)}` : '';
  const line = `[review-orchestrator] ${message}${payload}`;
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
/* Load                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Load a `ReviewSession` by id.
 *
 * Returns `null` when the row is missing — *does not throw*. The
 * decision to translate "not found" into a thrown error is left to
 * the caller so the public surface can decide how to surface it
 * (HTTP 404, queue retry, etc.).
 */
export const loadReviewSession = async (sessionId: string): Promise<ReviewSessionRow | null> => {
  return prisma.reviewSession.findUnique({
    where: { id: sessionId },
  });
};

/* -------------------------------------------------------------------------- */
/* Status transitions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * PENDING → RUNNING.
 *
 * Uses `updateMany` with a status guard so two callers cannot both
 * transition the same row. When the row is missing *or* its status
 * is not PENDING, `updateMany.count` is 0 — we then re-read the row
 * to disambiguate and throw a precise error code.
 */
export const startReview = async (sessionId: string): Promise<ReviewSessionRow> => {
  const updated = await prisma.reviewSession.updateMany({
    where: { id: sessionId, status: ReviewStatus.PENDING },
    data: { status: ReviewStatus.RUNNING },
  });

  if (updated.count === 1) {
    const row = await loadReviewSession(sessionId);
    if (!row) {
      // Vanishingly rare (concurrent delete). Treat as not found.
      throw new ReviewOrchestratorError(
        `Review session ${sessionId} disappeared after start.`,
        'NOT_FOUND',
      );
    }
    log('info', 'review started', { sessionId });
    return row;
  }

  // updateMany.count === 0 — either the row is missing or its
  // current status is not PENDING. Re-read to disambiguate.
  const current = await loadReviewSession(sessionId);
  if (!current) {
    throw new ReviewOrchestratorError(`Review session ${sessionId} not found.`, 'NOT_FOUND');
  }
  throw new ReviewOrchestratorError(
    `Review session ${sessionId} is in status ${current.status}; cannot start (expected PENDING).`,
    'INVALID_STATUS',
  );
};

/**
 * RUNNING → COMPLETED.
 *
 * `result` is the placeholder handler's return value. We accept it
 * for API symmetry with `runReview` but do **not** persist it yet —
 * the verdict engine + `ReviewResult` row land in a later task.
 */
export const completeReview = async (
  sessionId: string,
  result: ReviewHandlerResult,
): Promise<ReviewSessionRow> => {
  void result; // will be persisted alongside the verdict in a future task.

  const updated = await prisma.reviewSession.updateMany({
    where: { id: sessionId, status: ReviewStatus.RUNNING },
    data: { status: ReviewStatus.COMPLETED },
  });

  if (updated.count === 1) {
    const row = await loadReviewSession(sessionId);
    if (!row) {
      throw new ReviewOrchestratorError(
        `Review session ${sessionId} disappeared after completion.`,
        'NOT_FOUND',
      );
    }
    log('info', 'review completed', { sessionId, handler: result.handler });
    return row;
  }

  const current = await loadReviewSession(sessionId);
  if (!current) {
    throw new ReviewOrchestratorError(`Review session ${sessionId} not found.`, 'NOT_FOUND');
  }
  throw new ReviewOrchestratorError(
    `Review session ${sessionId} is in status ${current.status}; cannot complete (expected RUNNING).`,
    'INVALID_STATUS',
  );
};

/**
 * RUNNING → FAILED.
 *
 * `reason` is a short human-readable description of the failure.
 * It is logged but not yet persisted on the row — the failure
 * column arrives with the first analyzer task.
 */
export const failReview = async (sessionId: string, reason: string): Promise<ReviewSessionRow> => {
  const updated = await prisma.reviewSession.updateMany({
    where: { id: sessionId, status: ReviewStatus.RUNNING },
    data: { status: ReviewStatus.FAILED },
  });

  if (updated.count === 1) {
    const row = await loadReviewSession(sessionId);
    if (!row) {
      throw new ReviewOrchestratorError(
        `Review session ${sessionId} disappeared after failure.`,
        'NOT_FOUND',
      );
    }
    log('warn', 'review failed', { sessionId, reason });
    return row;
  }

  const current = await loadReviewSession(sessionId);
  if (!current) {
    throw new ReviewOrchestratorError(`Review session ${sessionId} not found.`, 'NOT_FOUND');
  }
  throw new ReviewOrchestratorError(
    `Review session ${sessionId} is in status ${current.status}; cannot fail (expected RUNNING).`,
    'INVALID_STATUS',
  );
};

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Signature shared by every type-specific handler. Each handler
 * receives the loaded session and returns a `ReviewHandlerResult`.
 */
type ReviewHandler = (session: ReviewSessionRow) => Promise<ReviewHandlerResult>;

/**
 * Dispatch a session to its type-specific handler.
 *
 * The `switch` over `ReviewType` is exhaustive — adding a new source
 * to the Prisma schema without wiring a handler here will fail to
 * compile thanks to the `never` check in the default branch.
 */
export const dispatchReviewHandler = async (
  session: ReviewSessionRow,
): Promise<ReviewHandlerResult> => {
  const handler: ReviewHandler = ((): ReviewHandler => {
    switch (session.type) {
      case ReviewType.WEBSITE:
        return runWebsiteReview;
      case ReviewType.GITHUB:
        return runGithubReview;
      case ReviewType.ZIP:
        return runZipReview;
      case ReviewType.PRIVATE_WEBSITE:
        return runPrivateWebsiteReview;
      default: {
        // Exhaustiveness: a new `ReviewType` added to the schema
        // without a matching handler lands here at compile time.
        const _exhaustive: never = session.type;
        throw new ReviewOrchestratorError(
          `No handler registered for review type ${String(_exhaustive)}.`,
          'UNKNOWN_TYPE',
        );
      }
    }
  })();

  return handler(session);
};

/* -------------------------------------------------------------------------- */
/* Placeholder handlers                                                       */
/* -------------------------------------------------------------------------- */

// Each handler below is a *placeholder*. The real collectors and
// agents land in later tasks. The contract is fixed: take the loaded
// session, return a `ReviewHandlerResult`. Throwing is allowed and
// is the contract for "this review cannot be processed"; `runReview`
// will catch the throw and mark the session FAILED.

/**
 * PLACEHOLDER — Public Website review.
 *
 * Future implementation: Playwright + Lighthouse + axe-core →
 * `WebsiteEvidenceBundle` → agent jury → verdict.
 */
export const runWebsiteReview: ReviewHandler = async (session) => {
  if (!session.target || session.target.trim().length === 0) {
    throw new ReviewOrchestratorError(
      `Website review ${session.id} is missing a target URL.`,
      'INVALID_STATUS',
    );
  }
  return {
    handler: 'website',
    status: 'completed',
    message: 'Placeholder handler for public website review.',
    notes: [
      `Session: ${session.id}`,
      `Target: ${session.target}`,
      'Real implementation will use Playwright + Lighthouse + axe-core.',
    ],
  };
};

/**
 * PLACEHOLDER — GitHub repository review.
 *
 * Future implementation: GitHub REST API (metadata, tree, README,
 * languages) → `GithubEvidenceBundle` → agent jury → verdict.
 */
export const runGithubReview: ReviewHandler = async (session) => {
  if (!session.target || session.target.trim().length === 0) {
    throw new ReviewOrchestratorError(
      `GitHub review ${session.id} is missing a target repository URL.`,
      'INVALID_STATUS',
    );
  }
  return {
    handler: 'github',
    status: 'completed',
    message: 'Placeholder handler for GitHub repository review.',
    notes: [
      `Session: ${session.id}`,
      `Target: ${session.target}`,
      'Real implementation will use the GitHub REST API.',
    ],
  };
};

/**
 * PLACEHOLDER — ZIP upload review.
 *
 * Future implementation: extract the archive, detect frameworks,
 * walk the file tree → `ZipEvidenceBundle` → agent jury → verdict.
 */
export const runZipReview: ReviewHandler = async (session) => {
  if (!session.target || session.target.trim().length === 0) {
    throw new ReviewOrchestratorError(
      `ZIP review ${session.id} is missing a target reference.`,
      'INVALID_STATUS',
    );
  }
  return {
    handler: 'zip',
    status: 'completed',
    message: 'Placeholder handler for ZIP upload review.',
    notes: [
      `Session: ${session.id}`,
      `Target: ${session.target}`,
      'Real implementation will extract the archive and analyze its contents.',
    ],
  };
};

/**
 * PLACEHOLDER — Private website review (auth-protected).
 *
 * Future implementation: authenticate with the supplied credentials,
 * then run the same pipeline as the public-website handler against
 * `PrivateEvidenceBundle` → agent jury → verdict.
 */
export const runPrivateWebsiteReview: ReviewHandler = async (session) => {
  if (!session.target || session.target.trim().length === 0) {
    throw new ReviewOrchestratorError(
      `Private website review ${session.id} is missing a target URL.`,
      'INVALID_STATUS',
    );
  }
  return {
    handler: 'private',
    status: 'completed',
    message: 'Placeholder handler for private website review.',
    notes: [
      `Session: ${session.id}`,
      `Target: ${session.target}`,
      'Real implementation will authenticate and then reuse the public-website pipeline.',
    ],
  };
};

/* -------------------------------------------------------------------------- */
/* Top-level entry                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Drive a `ReviewSession` through its full lifecycle.
 *
 *   1. Load the session.
 *   2. PENDING → RUNNING.
 *   3. Dispatch to the right handler.
 *   4a. On success: RUNNING → COMPLETED, return `{ ok: true, ... }`.
 *   4b. On failure: RUNNING → FAILED, return `{ ok: false, ... }`.
 *
 * Returns a `ReviewOrchestratorResult` for normal handler failures —
 * the session is now FAILED and the caller can surface that to the
 * user. *Unexpected* errors (DB outage, missing row, bad starting
 * status) are thrown as `ReviewOrchestratorError`.
 */
export const runReview = async (sessionId: string): Promise<ReviewOrchestratorResult> => {
  // 1. Load. A missing row throws NOT_FOUND — the API layer maps
  //    that to 404.
  const session = await loadReviewSession(sessionId);
  if (!session) {
    throw new ReviewOrchestratorError(`Review session ${sessionId} not found.`, 'NOT_FOUND');
  }

  // 2. PENDING → RUNNING. Also validates the row is in PENDING —
  //    any other starting state throws INVALID_STATUS.
  await startReview(session.id);

  // 3. Dispatch. Handler errors are caught and turned into FAILED.
  try {
    const handlerResult = await dispatchReviewHandler(session);

    // 4a. RUNNING → COMPLETED.
    await completeReview(session.id, handlerResult);

    return {
      ok: true,
      sessionId: session.id,
      status: 'COMPLETED',
      handler: handlerResult,
    };
  } catch (error) {
    // 4b. RUNNING → FAILED. If the row is no longer RUNNING (e.g. a
    // concurrent worker beat us to it), `failReview` will throw
    // INVALID_STATUS — we swallow that because the row is no longer
    // RUNNING, but we still want to report the *original* failure.
    const reason = isProduction
      ? 'Review handler failed.'
      : error instanceof Error
        ? error.message
        : 'Review handler failed.';

    try {
      await failReview(session.id, reason);
    } catch (failureTransitionError) {
      if (failureTransitionError instanceof ReviewOrchestratorError) {
        log('warn', 'could not transition to FAILED', {
          sessionId: session.id,
          originalReason: reason,
          transitionError: failureTransitionError.message,
        });
      } else {
        throw failureTransitionError;
      }
    }

    log('error', 'review handler threw', { sessionId: session.id, reason });

    return {
      ok: false,
      sessionId: session.id,
      status: 'FAILED',
      reason,
    };
  }
};
