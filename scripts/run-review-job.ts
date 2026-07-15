/**
 * scripts/run-review-job.ts — Off-Vercel review worker.
 *
 * Runs the full SONDA pipeline for a single review session, outside
 * Vercel's serverless time limit. Invoked by the GitHub Actions
 * workflow (.github/workflows/asp-review.yml) which is triggered by a
 * `repository_dispatch` event fired from `POST /api/asp/review`.
 *
 * Why this exists
 *   Vercel Hobby caps a function at 10s; the pipeline (evidence
 *   collection + six reviewers) takes 1-3 minutes. The API endpoint
 *   therefore only *enqueues* the job (creates the session, returns an
 *   id) and this worker does the long work on GitHub Actions, which
 *   allows up to 6h per job. Both processes talk to the same Postgres
 *   database, so the verdict this worker writes is immediately visible
 *   to the polling GET on Vercel.
 *
 * Contract
 *   - Reads the session id from `--session <id>` or the SESSION_ID env.
 *   - Reads credentials for private reviews from the PRIVATE_* env vars
 *     (passed as workflow inputs, never persisted to the session row).
 *   - Exits 0 on a completed pipeline (COMPLETED *or* FAILED — a failed
 *     review is a valid terminal state, not a worker error).
 *   - Exits 1 only on an infrastructure error (bad id, DB unreachable).
 *
 * Idempotency
 *   `runReview` starts with a PENDING → RUNNING compare-and-swap. If the
 *   session is not PENDING (already picked up), the orchestrator throws
 *   INVALID_STATUS and this worker exits 0 without double-running.
 */

import { runReview, ReviewOrchestratorError } from '@/services/review-orchestrator';
import type { RunReviewOptions } from '@/services/review-orchestrator';

const readArg = (flag: string): string | undefined => {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
};

const main = async (): Promise<void> => {
  const sessionId = readArg('--session') ?? process.env.SESSION_ID;

  if (!sessionId || sessionId.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.error('[run-review-job] no session id provided (--session <id> or SESSION_ID)');
    process.exit(1);
    return;
  }

  // Private-review credentials arrive as env vars from the workflow
  // inputs. They are only present for `type: "private"` sessions.
  const username = process.env.PRIVATE_USERNAME?.trim() || undefined;
  const password = process.env.PRIVATE_PASSWORD?.trim() || undefined;
  const twoFactorCode = process.env.PRIVATE_2FA?.trim() || undefined;
  const notes = process.env.REVIEW_NOTES?.trim() || undefined;

  const options: RunReviewOptions = {
    privateCredentials: username || password ? { username, password } : undefined,
    twoFactorCode,
    notes,
  };

  // eslint-disable-next-line no-console
  console.log(`[run-review-job] starting review ${sessionId}`);

  try {
    const result = await runReview(sessionId, options);
    // eslint-disable-next-line no-console
    console.log(
      `[run-review-job] review ${sessionId} finished: ${result.status}` +
        (result.ok ? '' : ` (${'reason' in result ? result.reason : 'failed'})`),
    );
    // COMPLETED or FAILED are both valid terminal outcomes.
    process.exit(0);
  } catch (error) {
    // INVALID_STATUS = another worker already claimed it. Not an error.
    if (error instanceof ReviewOrchestratorError && error.code === 'INVALID_STATUS') {
      // eslint-disable-next-line no-console
      console.log(`[run-review-job] review ${sessionId} already claimed; nothing to do.`);
      process.exit(0);
      return;
    }
    // NOT_FOUND or a DB error is a real failure.
    // eslint-disable-next-line no-console
    console.error(`[run-review-job] review ${sessionId} errored:`, error);
    process.exit(1);
  }
};

void main();
