/**
 * services/verdict.ts — Verdict pipeline + persistence
 *
 * Task 6.12 — Verdict Engine Persistence.
 *
 * Wraps the pure `features/verdict-engine` module with the
 * database write that lands the verdict on the
 * `review_results` table. The session-orchestrator's
 * completion path (or the future evidence-collector-backed
 * pipeline) is what calls this once the reviewer pipeline has
 * produced its outputs.
 *
 * Schema mapping
 *   - `verdict.overallScore` → `ReviewResult.overallScore` (Int, 0–100)
 *   - `verdict.status`       → `ReviewResult.verdict` (String, lowercase
 *     enum value: 'ready' / 'almost' / 'needs-work' / 'not-ready')
 *   - `verdict.headline` + `verdict.summary` → `ReviewResult.summary`
 *     (String; we store a two-line composite so the DB column
 *     remains a single `Text`.)
 *
 * Public API
 *   - `saveVerdict(sessionId, outputs)` — compute the verdict
 *     from the supplied reviewer outputs and persist it.
 *     Returns the verdict + the persisted row.
 *   - `loadVerdict(sessionId)` — fetch the row by session id,
 *     or return `null` if no verdict has been computed yet.
 */

import { prisma } from '@/lib/db';
import type { ReviewerOutput } from '@/agents/types';
import type { Verdict } from '@/types/review';
import { computeVerdict, VERDICT_LABELS } from '@/features/verdict-engine';

/* -------------------------------------------------------------------------- */
/* Logging helper                                                             */
/* -------------------------------------------------------------------------- */

const log = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  const payload = context ? ` ${JSON.stringify(context)}` : '';
  const line = `[verdict] ${message}${payload}`;
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
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The application-side `Verdict` projected back to the
 * database row shape (the `id`, `createdAt` columns are DB
 * defaults, not user input).
 */
export type PersistedVerdict = {
  id: string;
  sessionId: string;
  verdict: Verdict;
  createdAt: Date;
};

/**
 * The `verdict` column on the `review_results` table is a
 * `String` (see `prisma/schema.prisma#ReviewResult.verdict`).
 * We store the lower-case enum value (e.g. `'ready'`) so the
 * column stays stable and the application-side enum remains
 * the single source of truth.
 */
const STATUS_TO_COLUMN: Readonly<Record<Verdict['status'], string>> = {
  ready: 'ready',
  almost: 'almost',
  'needs-work': 'needs-work',
  'not-ready': 'not-ready',
};

/**
 * Compute the verdict from the supplied reviewer outputs and
 * persist the resulting row.
 *
 * The Prisma `ReviewResult` has a unique key on `sessionId`,
 * so a re-run updates the existing row in place rather than
 * throwing on conflict. This is the only valid behavior — a
 * session has exactly one verdict.
 *
 * @param sessionId  the `ReviewSession.id` the verdict belongs to.
 * @param outputs    the outputs from the reviewer pipeline.
 * @returns the computed verdict + the persisted row.
 */
export const saveVerdict = async (
  sessionId: string,
  outputs: ReadonlyArray<ReviewerOutput>,
): Promise<PersistedVerdict> => {
  const verdict = computeVerdict(outputs);

  const summary = `${verdict.headline}\n\n${verdict.summary}`;
  const verdictColumn = STATUS_TO_COLUMN[verdict.status];

  const row = await prisma.reviewResult.upsert({
    where: { sessionId },
    create: {
      sessionId,
      overallScore: verdict.overallScore,
      verdict: verdictColumn,
      summary,
    },
    update: {
      overallScore: verdict.overallScore,
      verdict: verdictColumn,
      summary,
    },
  });

  log('info', 'verdict saved', {
    sessionId,
    overallScore: verdict.overallScore,
    status: verdict.status,
    statusLabel: VERDICT_LABELS[verdict.status],
  });

  return {
    id: row.id,
    sessionId: row.sessionId,
    verdict,
    createdAt: row.createdAt,
  };
};

/**
 * Load the verdict for a session, or return `null` if no
 * verdict has been computed yet.
 *
 * The `verdict` column is a `String`; we look up the matching
 * `VerdictStatus` and rebuild a minimal `Verdict` shape so
 * the API consumer does not have to think about the DB
 * representation. (The full per-reviewer outputs are loaded
 * separately by the results API — this function only returns
 * the verdict, not the underlying outputs.)
 */
export const loadVerdict = async (sessionId: string): Promise<PersistedVerdict | null> => {
  const row = await prisma.reviewResult.findUnique({ where: { sessionId } });
  if (!row) return null;

  // Parse the status from the column. Unknown values are
  // treated as 'needs-work' (defensive) so the API still
  // returns a valid `Verdict` shape.
  const status = parseStatus(row.verdict);

  // The `summary` column is a headline + body composite that
  // we wrote in `saveVerdict`. We split it back on the first
  // blank line; older rows that predate this format fall
  // back to a single-line headline.
  const [headline, ...bodyLines] = row.summary.split('\n\n');
  const summary = bodyLines.length > 0 ? bodyLines.join('\n\n') : (headline ?? '');

  return {
    id: row.id,
    sessionId: row.sessionId,
    createdAt: row.createdAt,
    verdict: {
      overallScore: row.overallScore,
      status,
      headline: headline ?? '',
      summary,
      topStrengths: [],
      topWeaknesses: [],
      priorityFixes: [],
      reviewerOutputs: [],
    },
  };
};

const VALID_STATUSES: ReadonlyArray<Verdict['status']> = [
  'ready',
  'almost',
  'needs-work',
  'not-ready',
];

const parseStatus = (raw: string): Verdict['status'] => {
  return (VALID_STATUSES as ReadonlyArray<string>).includes(raw)
    ? (raw as Verdict['status'])
    : 'needs-work';
};
