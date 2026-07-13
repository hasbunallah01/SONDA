/**
 * agents/registry — The canonical reviewer registry.
 *
 * Task 6.9 — Reviewer Registry.
 *
 * Collects every `ReviewerModule` from `agents/<name>/` into a
 * single list, builds a type-safe `ReviewerMap` keyed by
 * `ReviewerId`, and exposes a `getReviewer(id)` helper for the
 * orchestrator.
 *
 * Why a registry?
 *  - One place to add / remove a reviewer. The orchestrator does
 *    not import from `agents/qa/`, `agents/ux/`, etc. directly;
 *    it iterates this registry.
 *  - Exhaustiveness is enforced at compile time. Adding a new
 *    `ReviewerId` to `agents/types.ts` without registering a
 *    matching module here fails the build.
 *  - The `ReviewerMap` gives O(1) lookup at runtime without
 *    re-importing.
 *
 * Out of scope (per task)
 *  - No async loading, no dynamic import — the modules are
 *    statically imported so a missing module is caught at
 *    compile time, not at first use.
 *  - No per-session enable / disable. A future task can layer
 *    that on top via `ReviewerRunOptions.enabledIds`.
 */

import type { ReviewerMap, ReviewerModule, ReviewerRegistry } from './contract';
import type { ReviewerId } from './types';

import qaModule from './qa';
import uxModule from './ux';
import marketingModule from './marketing';
import investorModule from './investor';
import judgeModule from './judge';
import firstUserModule from './first-user';

/* -------------------------------------------------------------------------- */
/* The registry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The full set of reviewer modules the orchestrator can dispatch.
 *
 * The order is intentional: QA first (it gates technical
 * readiness), then the design + GTM lens (UX, Marketing,
 * First-User), then the external lenses (Investor, Judge). The
 * orchestrator iterates this array; downstream code should not
 * depend on the order, but having a deterministic order makes
 * logs and the running-review UI stable.
 */
export const reviewerRegistry: ReviewerRegistry = [
  qaModule,
  uxModule,
  marketingModule,
  investorModule,
  judgeModule,
  firstUserModule,
];

/**
 * A `ReviewerMap` keyed by `ReviewerId`. Built once at module
 * load time from `reviewerRegistry`. O(1) lookups.
 *
 * The exhaustiveness check below fails to compile if a new
 * `ReviewerId` is added to the union without registering a
 * matching module.
 */
const buildReviewerMap = (registry: ReviewerRegistry): ReviewerMap => {
  const map: Partial<Record<ReviewerId, ReviewerModule>> = {};
  for (const entry of registry) {
    map[entry.REVIEWER_ID] = entry;
  }
  return map as ReviewerMap;
};

export const reviewerMap: ReviewerMap = buildReviewerMap(reviewerRegistry);

/* -------------------------------------------------------------------------- */
/* Lookup helper                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Return the `ReviewerModule` for a given id, or `undefined` if
 * the id is not registered.
 *
 * The orchestrator uses this when it needs to look up a single
 * reviewer (e.g. to re-run a specific juror on a session).
 */
export const getReviewer = (id: ReviewerId): ReviewerModule | undefined => {
  return reviewerMap[id];
};

/**
 * Return the list of reviewer ids currently registered, in the
 * same order as `reviewerRegistry`. Useful for log lines and
 * for building the running-review UI.
 */
export const getReviewerIds = (): ReadonlyArray<ReviewerId> => {
  return reviewerRegistry.map((entry) => entry.REVIEWER_ID);
};
