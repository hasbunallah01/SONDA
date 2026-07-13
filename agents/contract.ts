/**
 * agents/contract — The `Reviewer` interface every agent must implement.
 *
 * Scope (Task 6.3.2 — types and interfaces only)
 *  - `Reviewer`         the object-shaped contract an agent
 *                       exports; introspectable at registration
 *                       time so the orchestrator, verdict
 *                       engine, and UI can read its descriptor
 *                       and rubric without running it.
 *  - `ReviewerFactory`  a function shape that builds a `Reviewer`
 *                       from optional dependencies (LLM client,
 *                       config). Lets future tasks inject a real
 *                       LLM without changing the contract.
 *  - `ReviewerModule`   the public surface every
 *                       `agents/<name>/index.ts` must export.
 *                       The orchestrator's registry will type-
 *                       check each module against this shape.
 *  - `ReviewerRegistry` the list of reviewers available to the
 *                       orchestrator. Concrete registry
 *                       construction is out of scope here; only
 *                       the type is defined.
 *
 *  - `ReviewerMap`      a type-level id → module map. Lets the
 *                       orchestrator look up a reviewer by id
 *                       in O(1) with full type safety.
 *
 * Out of scope (per task)
 *  - No reviewer logic, no LLM calls, no service code.
 *  - The per-reviewer `agents/<name>/index.ts` placeholders
 *    are not refactored against this contract in this task;
 *    that lands when the real reviewers are implemented.
 */

import type {
  ReviewerContext,
  ReviewerDescriptor,
  ReviewerError,
  ReviewerId,
  ReviewerOutput,
  ReviewerRunOptions,
  ReviewerRunStatus,
  ReviewerRubric,
} from './types';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/**
 * `Reviewer` — the object-shaped contract every agent in
 * `agents/<name>/` must satisfy.
 *
 * Design notes
 *  - Object, not function, so the descriptor and rubric are
 *    introspectable at registration time. The verdict engine
 *    needs `descriptor.defaultWeight` without running the
 *    reviewer, and the UI needs `rubric` to render what this
 *    juror measures.
 *  - `run()` is pure with respect to `ctx` — the orchestrator
 *    owns retries, persistence, and lifecycle. The reviewer
 *    must not write to the database or to `console` outside of
 *    what its contract allows.
 *  - `validate()` is optional; the default behavior of the
 *    registry's structural validator is good enough for most
 *    reviewers. Override only when you need tighter checks
 *    (e.g. score range by rubric).
 */
export interface Reviewer {
  /** Stable id. Must match `descriptor.id`. */
  readonly id: ReviewerId;
  /** Static metadata. */
  readonly descriptor: ReviewerDescriptor;
  /** The rubric this reviewer scores against. */
  readonly rubric: ReviewerRubric;
  /**
   * Validate an output structurally. Called by the verdict
   * engine before persisting a result. Returning `{ ok: false }`
   * surfaces as a `ReviewerError` with `kind: 'parse-error'`
   * and `retriable: false`.
   */
  validate?(output: ReviewerOutput): { ok: true } | { ok: false; reason: string };
  /**
   * Run the reviewer. Throws / rejects with a `ReviewerError`
   * (or a plain `Error` that the orchestrator wraps) on
   * failure. The returned `ReviewerOutput` MUST satisfy
   * `ReviewerOutput.schemaVersion === 1`.
   */
  run(ctx: ReviewerContext, options?: ReviewerRunOptions): Promise<ReviewerOutput>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * `ReviewerFactory` — a function that builds a `Reviewer` from
 * optional dependencies. Lets future tasks inject a real LLM
 * client (and other dependencies) without changing the
 * contract every reviewer module exports.
 *
 *   type Deps = { openai: OpenAIClient };
 *   export const createQaReviewer: ReviewerFactory<Deps> = (deps) => ({ ... });
 */
export type ReviewerFactory<Deps = unknown> = (deps?: Deps) => Reviewer;

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

/**
 * `ReviewerModule` — the public surface every
 * `agents/<name>/index.ts` must export. The orchestrator's
 * reviewer registry type-checks each module against this
 * shape, so missing fields are caught at compile time.
 *
 *   reviewer      — the new object-shaped contract.
 *   REVIEWER_ID   — the legacy `REVIEWER_ID` const kept for
 *                   backward compatibility with earlier tasks.
 *   runReviewer   — the legacy `runReviewer` function kept for
 *                   backward compatibility. Implementations
 *                   should delegate to `reviewer.run(ctx, opts)`.
 */
export type ReviewerModule = {
  reviewer: Reviewer;
  REVIEWER_ID: ReviewerId;
  runReviewer: (ctx: ReviewerContext, options?: ReviewerRunOptions) => Promise<ReviewerOutput>;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * `ReviewerRegistry` — the list of reviewers available to the
 * orchestrator. Concrete registry construction (the function
 * that builds this list from `agents/<name>/index.ts` modules)
 * lands with the review engine; only the type is defined here.
 */
export type ReviewerRegistry = ReadonlyArray<ReviewerModule>;

/**
 * `ReviewerMap` — a type-level id → module map. Lets the
 * orchestrator look up a reviewer by id in O(1) with full
 * type safety. The concrete map is built at registry time
 * from a `ReviewerRegistry`.
 */
export type ReviewerMap = Readonly<Record<ReviewerId, ReviewerModule>>;

/**
 * `ReviewerProgress` — what the orchestrator emits on the
 * live progress stream for a single reviewer run. The
 * payload is intentionally light (status + optional summary
 * excerpt) so the stream can be polled cheaply.
 */
export type ReviewerProgress = {
  reviewer: ReviewerId;
  status: ReviewerRunStatus;
  /** Wall-clock start time, in ms since epoch. */
  startedAt?: number;
  /** Wall-clock end time, in ms since epoch. Set on
   *  `completed` and `failed`. */
  endedAt?: number;
  /** A short, log-safe message (no PII, no full evidence). */
  message?: string;
  /** The error, if `status === 'failed'`. */
  error?: ReviewerError;
};
