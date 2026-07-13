/**
 * agents/types — Shared types for all reviewer agents.
 *
 * The single source of truth for the reviewer contract. Every
 * `agents/<name>/` module imports from here, and the verdict
 * engine imports from here. There is no agent-local "Reviewer"
 * interface; that lives in `agents/contract.ts` and is also
 * re-exported by this file for convenience.
 *
 * Scope (Task 6.3.2 — types and interfaces only)
 *  - Identity:        ReviewerId, ReviewerRole, ReviewerDescriptor
 *  - Inputs:          ReviewerContext, ReviewerRunOptions
 *  - Outputs:         ReviewerOutput, PriorityFix, ReviewerFinding,
 *                     ReviewerError, ReviewerRunStatus
 *  - Scoring:         ReviewerRubric, RubricItem, RubricScore,
 *                     ReviewerScore, ScoreLevel
 *  - Persistence:     ReviewerResultRow, ReviewerResultInput
 *                     (the DB-row shape, derived from
 *                     `prisma/schema.prisma#ReviewerResult` so
 *                     the contract and the storage stay in sync)
 *
 * Out of scope (per task)
 *  - No reviewer logic, no LLM calls, no service code.
 *  - The contract interface (`Reviewer`) lives in `contract.ts`.
 *  - The per-reviewer `agents/<name>/index.ts` placeholders are
 *    not refactored against the new contract in this task;
 *    that lands when the real reviewers are implemented.
 */

import type { EvidenceBundle } from '@/types/evidence';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * `ReviewerId` — the closed set of jurors in SONDA's panel.
 *
 * Aligned with the `ReviewerType` enum in
 * `prisma/schema.prisma` (e.g. `QA` ↔ `'qa'`). When the database
 * enum gains a new value, this union gains a new member at the
 * same time; TypeScript's exhaustiveness checks make the
 * reviewer registry fail to compile if the two drift.
 */
export type ReviewerId = 'qa' | 'ux' | 'marketing' | 'investor' | 'judge' | 'first-user';

/**
 * `ReviewerRole` — the human-readable label for each juror.
 * Shown on the running-review UI and on the results page.
 */
export type ReviewerRole =
  | 'QA Engineer'
  | 'UX Designer'
  | 'Marketing / GTM Expert'
  | 'Investor / Funding Lens'
  | 'Hackathon Judge'
  | 'First-time User';

/**
 * `REVIEWER_ROLES` — runtime lookup from `ReviewerId` to its
 * `ReviewerRole`. Keeps the display label next to the id so the
 * UI never has to inline a string literal.
 */
export const REVIEWER_ROLES: Readonly<Record<ReviewerId, ReviewerRole>> = {
  qa: 'QA Engineer',
  ux: 'UX Designer',
  marketing: 'Marketing / GTM Expert',
  investor: 'Investor / Funding Lens',
  judge: 'Hackathon Judge',
  'first-user': 'First-time User',
};

/**
 * `ReviewerDescriptor` — static metadata about a juror.
 *
 * Returned by the `Reviewer.descriptor` getter on every
 * `Reviewer` (see `agents/contract.ts`). Used by:
 *   - the orchestrator, to register the juror;
 *   - the verdict engine, to know the default weight;
 *   - the UI, to render the reviewer's card.
 */
export type ReviewerDescriptor = {
  /** Stable id, must match the `ReviewerId` on the parent. */
  id: ReviewerId;
  /** Human-readable role label. */
  role: ReviewerRole;
  /** 1–2 sentence explanation of what this juror scores on. */
  description: string;
  /**
   * Default weight (0–1) the verdict engine uses when this
   * reviewer is enabled and no per-session override is given.
   * Weights across enabled reviewers should sum to 1.
   */
  defaultWeight: number;
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * `ReviewerContext` — the per-run input handed to every reviewer.
 *
 *   evidence      — normalized evidence bundle produced by the
 *                   source-specific collector (browser, GitHub,
 *                   ZIP, private). Source-agnostic by design.
 *   sessionId     — the durable `ReviewSession.id` this run
 *                   belongs to. Used for log correlation and to
 *                   look up related data (session metadata).
 *   reviewer      — the id of the reviewer being run. The same
 *                   bundle is evaluated by every reviewer, so
 *                   this lets a shared `run(ctx)` know which
 *                   juror it currently is.
 *   runId         — opaque per-invocation id. Two invocations of
 *                   the same reviewer on the same session (e.g.
 *                   on retry) get different runIds.
 *   locale        — BCP-47 locale tag, defaults to 'en-US'.
 *   maxTokens     — upper bound on the LLM response size. The
 *                   reviewer should not exceed this when emitting
 *                   long-form fields like `summary`.
 *   temperature   — sampling temperature for the LLM, in [0, 1].
 *                   0 = deterministic, 1 = max creativity.
 *   priorOutputs  — outputs from peer reviewers that have already
 *                   completed for this session, if any. Lets the
 *                   current reviewer calibrate against them.
 *   signal        — `AbortSignal`. When aborted, the reviewer
 *                   should reject and stop.
 */
export type ReviewerContext = {
  evidence: EvidenceBundle;
  sessionId: string;
  reviewer: ReviewerId;
  runId: string;
  locale?: string;
  maxTokens?: number;
  temperature?: number;
  priorOutputs?: ReadonlyArray<ReviewerOutput>;
  signal?: AbortSignal;
};

/**
 * `ReviewerRunOptions` — orchestration-level overrides applied
 * at run time (e.g. by the orchestrator or the API). Kept
 * separate from `ReviewerContext` so the context stays a pure
 * data carrier (easy to log, serialize, and snapshot).
 */
export type ReviewerRunOptions = {
  maxTokens?: number;
  temperature?: number;
  locale?: string;
  timeoutMs?: number;
};

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/**
 * `PriorityFix` — one concrete remediation a reviewer suggests.
 *
 * `effort` and `impact` are string-literal unions that mirror
 * the `PriorityFixEffort` / `PriorityFixImpact` enums in
 * `prisma/schema.prisma` (the application-side type uses
 * lowercase to match `agents/types.ts#PriorityFix` from
 * earlier tasks and stays as a type-only mirror of the DB enum).
 */
export type PriorityFix = {
  /** Short headline, ≤ 80 chars. */
  title: string;
  /** 1–3 sentence explanation. */
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
};

/**
 * `ReviewerFinding` — a single observed strength or weakness
 * with optional confidence and category. Reviewers may emit
 * any number of findings; the verdict engine rolls them up
 * into the final `ReviewResult.summary`, `topStrengths`, and
 * `topWeaknesses`.
 */
export type ReviewerFinding = {
  /** Short, headline-grade label (≤ 80 chars). */
  title: string;
  /** 1–3 sentence explanation. */
  detail: string;
  /** Optional category. Free-form for now; the verdict engine
   *  groups findings by this label when present. */
  category?: string;
  /** 0–1, the reviewer's confidence that this finding is real
   *  and applicable. Distinct from the overall output confidence. */
  confidence?: number;
};

/**
 * `ReviewerOutput` — the structured result every reviewer emits.
 *
 * Field mapping vs. `prisma/schema.prisma#ReviewerResult`:
 *   reviewer        → `reviewer` (ReviewerType enum)
 *   score           → `score` (Int)
 *   confidence      → `confidence` (Float)
 *   summary         → `summary` (String)
 *   strengths       → `strengths` (String[])
 *   weaknesses      → `weaknesses` (String[])
 *   priorityFixes   → `priorityFixes` (Json)
 *   rubricScores    → in-memory only for now; persistence lands
 *                     with the verdict engine (a future `rubric`
 *                     column, or folded into `priorityFixes` JSON)
 *   findings        → in-memory only for now
 *   schemaVersion   → in-memory only; the DB schema version is
 *                     tracked separately by Prisma migrations
 */
export type ReviewerOutput = {
  reviewer: ReviewerId;
  /** 0–100, integer in storage. */
  score: number;
  /** 0–1. */
  confidence: number;
  /** Human-readable headline + write-up. */
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  /** Optional per-axis breakdown (see `ReviewerRubric`). */
  rubricScores?: ReadonlyArray<RubricScore>;
  /** Optional structured findings, in addition to the
   *  flat `strengths` / `weaknesses` lists. */
  findings?: ReadonlyArray<ReviewerFinding>;
  /** Schema version of this output shape. Bumped when the
   *  contract changes in a way downstream consumers must
   *  react to. Currently pinned at 1. */
  schemaVersion: 1;
};

/**
 * `ReviewerError` — the structured error a reviewer can throw
 * or return. `kind` lets the orchestrator decide whether to
 * retry, surface to the user, or mark the run as `FAILED`.
 */
export type ReviewerError = {
  reviewer: ReviewerId;
  kind:
    | 'invalid-input'
    | 'upstream-timeout'
    | 'upstream-rate-limit'
    | 'llm-error'
    | 'parse-error'
    | 'aborted'
    | 'unknown';
  message: string;
  /** Whether the orchestrator is allowed to retry. */
  retriable: boolean;
  /** Underlying error object, if any. Not persisted. */
  cause?: unknown;
};

/**
 * `ReviewerRunStatus` — the lifecycle of a single reviewer
 * invocation. Mirrors (but is distinct from) the session-level
 * `ReviewStatus` in `prisma/schema.prisma`; the per-reviewer
 * status is tracked in memory and surfaced via the live
 * progress stream.
 */
export type ReviewerRunStatus = 'pending' | 'running' | 'completed' | 'failed';

// ---------------------------------------------------------------------------
// Scoring structure
// ---------------------------------------------------------------------------

/**
 * `ScoreLevel` — qualitative bucket a numeric score falls into.
 * The verdict engine (and the UI) maps an overall 0–100 score
 * to one of these for color-coding and headline copy.
 */
export type ScoreLevel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * `scoreLevel` — pure mapping from a numeric score to its
 * `ScoreLevel`. Lives next to the type so reviewers, the
 * verdict engine, and the UI agree on the same buckets:
 *
 *   ≥ 85  → 'excellent'
 *   ≥ 70  → 'good'
 *   ≥ 50  → 'fair'
 *   < 50  → 'poor'
 */
export const scoreLevel = (n: number): ScoreLevel => {
  if (n >= 85) return 'excellent';
  if (n >= 70) return 'good';
  if (n >= 50) return 'fair';
  return 'poor';
};

/**
 * `RubricItem` — one axis a reviewer scores on.
 *
 *   id          — stable, machine-readable name (e.g. 'clarity').
 *   label       — human-readable label (e.g. 'Clarity of value prop').
 *   description — optional 1-sentence rubric guidance.
 *   weight      — 0–1; how much this axis contributes to the
 *                 overall score. Weights within a single rubric
 *                 MUST sum to 1; reviewers are responsible for
 *                 enforcing that invariant.
 */
export type RubricItem = {
  id: string;
  label: string;
  description?: string;
  weight: number;
};

/**
 * `ReviewerRubric` — the full set of axes a reviewer scores on.
 * Returned by `Reviewer.rubric` so the verdict engine and the
 * UI can introspect what this juror measures.
 */
export type ReviewerRubric = ReadonlyArray<RubricItem>;

/**
 * `RubricScore` — a single axis score. `score` is 0–100.
 * `rubricId` matches a `RubricItem.id` on the parent rubric.
 */
export type RubricScore = {
  rubricId: string;
  score: number;
  /** Optional reviewer note justifying the score on this axis. */
  note?: string;
};

/**
 * `ReviewerScore` — overall + per-axis breakdown. Returned by
 * the reviewer (as part of `ReviewerOutput.rubricScores`) and
 * used by the verdict engine for diagnostics. The persisted
 * `ReviewerResult.score` is the `overall` value; the breakdown
 * is in-memory only for now.
 */
export type ReviewerScore = {
  /** 0–100, weighted across the rubric. */
  overall: number;
  /** Optional per-axis breakdown. */
  breakdown?: ReadonlyArray<RubricScore>;
  /** Qualitative bucket for the overall score. */
  level: ScoreLevel;
};

// ---------------------------------------------------------------------------
// Persistence mapping
// ---------------------------------------------------------------------------

/**
 * `ReviewerResultRow` — the shape of a `ReviewerResult` row
 * after reading it from Postgres. Mirrors the Prisma model
 * 1-to-1; defined here so reviewers and the verdict engine
 * have a typed handle to a persisted row without importing
 * from `@prisma/client` directly (keeps the agents layer
 * framework-agnostic).
 */
export type ReviewerResultRow = {
  id: string;
  sessionId: string;
  reviewer: ReviewerId;
  score: number;
  confidence: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * `ReviewerResultInput` — the shape the orchestrator hands to
 * `prisma.reviewerResult.create` to persist a fresh row.
 * Omits `id`, `createdAt`, `updatedAt` (DB defaults) and the
 * timestamp columns.
 */
export type ReviewerResultInput = Omit<ReviewerResultRow, 'id' | 'createdAt' | 'updatedAt'>;
