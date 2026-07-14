/**
 * app/api/asp/review/route.ts — POST /api/asp/review
 *
 * Agent-facing, A2MCP-compliant entry point for SONDA (OKX.AI ASP
 * listing). A free A2MCP endpoint must return the result directly:
 * one call in, the complete verdict out. This route accepts the same
 * body as `POST /api/reviews`, drives the full pipeline synchronously,
 * and responds with the entire wire payload (session, evidence,
 * reviewerResults, verdict) — no follow-up GET required.
 *
 * The human-facing web flow (`POST /api/reviews` + polling
 * `GET /api/reviews/:id`) is untouched; this route reuses the same
 * validation (`lib/review-request.ts`), the same orchestrator, and the
 * same wire projection (`lib/review-wire.ts`), so both surfaces stay
 * in lockstep.
 *
 * Request body
 *  ```json
 *  {
 *    "type": "website" | "github" | "zip" | "private",
 *    "target": "https://example.com",
 *    "username": "...",        // optional, private only
 *    "password": "...",        // optional, private only
 *    "twoFactorCode": "...",   // optional
 *    "notes": "..."            // optional
 *  }
 *  ```
 *
 * Successful response (200)
 *  ```json
 *  {
 *    "ok": true,
 *    "reportUrl": "https://<host>/review/<id>",
 *    "session": { ... },
 *    "evidence": { ... },
 *    "reviewerResults": [ ... ],
 *    "verdict": { "overallScore": 86, "status": "almost", ... }
 *  }
 *  ```
 *
 * A failed pipeline still returns 200 with `ok: false` + `reason` and
 * `session.status: "FAILED"` so calling agents get a machine-readable
 * outcome instead of an opaque error. 400/500 are reserved for
 * malformed requests and infrastructure errors.
 *
 * GET /api/asp/review returns a small service descriptor (name,
 * description, usage) so agents and reviewers can discover the
 * contract without documentation.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { createReviewSchema, toPrismaReviewType } from '@/lib/review-request';
import { loadReviewWirePayload } from '@/lib/review-wire';
import { runReview, type RunReviewOptions } from '@/services/review-orchestrator';

/**
 * The pipeline (evidence collection + reviewers + verdict) runs
 * synchronously inside this request and can take a couple of
 * minutes. Give the function the full window so long reviews do
 * not 504 mid-pipeline.
 */
export const maxDuration = 300;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const errorResponse = (message: string, status: number, details?: unknown): NextResponse =>
  NextResponse.json(
    {
      error: {
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );

/** Absolute link to the human-readable report for a session. */
const buildReportUrl = (request: Request, sessionId: string): string => {
  try {
    const origin = new URL(request.url).origin;
    return `${origin}/review/${sessionId}`;
  } catch {
    return `/review/${sessionId}`;
  }
};

/* -------------------------------------------------------------------------- */
/* Route handlers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/asp/review — run a full SONDA review and return the
 * complete verdict in the response body.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  // 1. Parse JSON body. A malformed body is a 400, not a 500.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  // 2. Validate against the shared schema — identical contract to
  //    the web intake route.
  const parsed = createReviewSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('Invalid request body.', 400, parsed.error.issues);
  }

  const { type, target, username, password, twoFactorCode, notes } = parsed.data;

  // 3. Persist the session in PENDING.
  let sessionId: string;
  try {
    const session = await prisma.reviewSession.create({
      data: {
        type: toPrismaReviewType(type),
        status: 'PENDING',
        target,
      },
      select: { id: true },
    });
    sessionId = session.id;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/asp/review] failed to create session', error);

    const message = isProduction
      ? 'Failed to create review session.'
      : error instanceof Error
        ? `Failed to create review session: ${error.message}`
        : 'Failed to create review session.';

    return errorResponse(message, 500);
  }

  // 4. Drive the pipeline synchronously. The orchestrator handles
  //    every status transition; on failure the session is marked
  //    FAILED and we still return the payload with ok:false.
  let ok = false;
  let reason: string | undefined;
  try {
    const options: RunReviewOptions = {
      privateCredentials:
        type === 'private' && (username || password) ? { username, password } : undefined,
      twoFactorCode,
      notes,
    };
    const result = await runReview(sessionId, options);
    ok = result.ok;
    reason = result.ok ? undefined : result.reason;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/asp/review] orchestrator failed', error);
    ok = false;
    reason = isProduction
      ? 'The review pipeline failed.'
      : error instanceof Error
        ? error.message
        : 'The review pipeline failed.';
  }

  // 5. Load the final state and return the complete result directly —
  //    this is the A2MCP contract: one call, full verdict.
  try {
    const payload = await loadReviewWirePayload(sessionId);
    if (!payload) {
      return errorResponse(`Review session ${sessionId} disappeared.`, 500);
    }
    return NextResponse.json(
      {
        ok,
        ...(reason !== undefined ? { reason } : {}),
        reportUrl: buildReportUrl(request, sessionId),
        ...payload,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/asp/review] failed to load result', error);

    const message = isProduction
      ? 'The review ran but the result could not be loaded.'
      : error instanceof Error
        ? `The review ran but the result could not be loaded: ${error.message}`
        : 'The review ran but the result could not be loaded.';

    return errorResponse(message, 500);
  }
};

/**
 * GET /api/asp/review — self-describing service descriptor so agents
 * (and OKX reviewers) can discover the contract with one request.
 */
export const GET = (request: Request): NextResponse => {
  let origin = '';
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = '';
  }
  return NextResponse.json(
    {
      name: 'SONDA — AI Product Launch Jury',
      description:
        'Autonomous multi-agent product review. Submit a public website, private website, GitHub repository, or project ZIP URL; a jury of AI reviewers (QA, UX, Marketing, Investor, Judge) investigates it and returns a launch verdict: overall score /100, status, top strengths, top issues, and prioritized fixes.',
      pricing: 'free',
      endpoint: {
        method: 'POST',
        url: `${origin}/api/asp/review`,
        contentType: 'application/json',
        body: {
          type: "'website' | 'github' | 'zip' | 'private' (required)",
          target: 'URL of the site, repo, or hosted .zip (required)',
          username: 'login for private targets (optional)',
          password: 'password for private targets (optional)',
          twoFactorCode: '2FA code for private targets (optional)',
          notes: 'reviewer guidance, max 2000 chars (optional)',
        },
        returns:
          'The complete review in one response: { ok, reportUrl, session, evidence, reviewerResults[], verdict { overallScore, status, headline, summary, topStrengths, topWeaknesses, priorityFixes } }. Typical runtime 1-3 minutes; keep the connection open.',
      },
      example: {
        request: { type: 'website', target: 'https://example.com' },
      },
    },
    { status: 200 },
  );
};

/**
 * Reject every other verb explicitly so callers get a clean 405.
 */
export const PUT = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PATCH = (): NextResponse => errorResponse('Method not allowed.', 405);
export const DELETE = (): NextResponse => errorResponse('Method not allowed.', 405);
