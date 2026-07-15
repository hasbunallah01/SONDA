/**
 * app/api/asp/review/route.ts — SONDA ASP endpoint (OKX.AI A2MCP).
 *
 * Async submit-then-poll design, so every request finishes well inside
 * Vercel Hobby's 10s function limit while the full 1-3 min pipeline runs
 * off-Vercel on GitHub Actions.
 *
 *   POST /api/asp/review
 *     Validates the body, creates a PENDING session, fires a
 *     `repository_dispatch` event (event type `asp-review`) carrying the
 *     session id, and returns immediately (<1s) with:
 *       { ok, status: "pending", id, poll, reportUrl, estimatedSeconds }
 *     The GitHub Actions worker (.github/workflows/asp-review.yml) runs
 *     the pipeline and writes the verdict to the shared database.
 *
 *   GET /api/asp/review?id=<id>
 *     Returns the current state of a session. While the worker runs:
 *       { ok, status: "pending" | "running", id, poll }
 *     When done:
 *       { ok, status: "completed", ...full wire payload with verdict }
 *     or { ok: false, status: "failed", reason, ... } on a failed review.
 *
 *   GET /api/asp/review        (no id)
 *     Self-describing service descriptor for agent/marketplace discovery.
 *
 * Why async: a free A2MCP endpoint must return the result to the caller,
 * but nothing requires it to block for minutes. The poll URL is returned
 * up front and carries the result the moment it is ready — the caller
 * gets the full verdict, just over two short requests instead of one long
 * one. This is the standard agent-polling pattern.
 */

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { createReviewSchema, toPrismaReviewType } from '@/lib/review-request';
import { loadReviewWirePayload } from '@/lib/review-wire';

/** Keep the function tiny — enqueue only, no pipeline work here. */
export const maxDuration = 10;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const errorResponse = (message: string, status: number, details?: unknown): NextResponse =>
  NextResponse.json(
    { error: { message, ...(details !== undefined ? { details } : {}) } },
    { status },
  );

const originOf = (request: Request): string => {
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
};

const pollUrl = (request: Request, id: string): string =>
  `${originOf(request)}/api/asp/review?id=${encodeURIComponent(id)}`;

const reportUrl = (request: Request, id: string): string => `${originOf(request)}/review/${id}`;

/**
 * Fire a `repository_dispatch` event that wakes the GitHub Actions
 * worker. Returns true on success. Never throws — a dispatch failure
 * is surfaced to the caller as a 503 by the POST handler.
 */
const dispatchWorker = async (
  sessionId: string,
  credentials: {
    username?: string;
    password?: string;
    twoFactorCode?: string;
    notes?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return { ok: false, reason: 'Worker dispatch is not configured (missing token).' };
  }
  const repo = env.GITHUB_DISPATCH_REPO;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'asp-review',
        client_payload: {
          sessionId,
          ...credentials,
        },
      }),
    });
    // GitHub returns 204 No Content on a successful dispatch.
    if (res.status === 204) return { ok: true };
    const text = await res.text().catch(() => '');
    return {
      ok: false,
      reason: `Dispatch failed (${res.status}). ${text.slice(0, 200)}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Dispatch request failed.',
    };
  }
};

/* -------------------------------------------------------------------------- */
/* POST — enqueue a review                                                    */
/* -------------------------------------------------------------------------- */

export const POST = async (request: Request): Promise<NextResponse> => {
  // 1. Parse + validate — identical contract to the web intake route.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }
  const parsed = createReviewSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('Invalid request body.', 400, parsed.error.issues);
  }
  const { type, target, username, password, twoFactorCode, notes } = parsed.data;

  // 2. Create the PENDING session.
  let sessionId: string;
  try {
    const session = await prisma.reviewSession.create({
      data: { type: toPrismaReviewType(type), status: 'PENDING', target },
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

  // 3. Fire the worker. Credentials travel in the dispatch payload, not
  //    the session row.
  const dispatched = await dispatchWorker(sessionId, {
    username,
    password,
    twoFactorCode,
    notes,
  });
  if (!dispatched.ok) {
    // Mark the orphaned session FAILED so a later poll is truthful.
    await prisma.reviewSession
      .update({ where: { id: sessionId }, data: { status: 'FAILED' } })
      .catch(() => undefined);
    // eslint-disable-next-line no-console
    console.error('[api/asp/review] dispatch failed', dispatched.reason);
    return errorResponse(
      isProduction ? 'Could not start the review worker.' : dispatched.reason,
      503,
    );
  }

  // 4. Return immediately with the poll URL. The caller polls GET until
  //    status is completed/failed.
  return NextResponse.json(
    {
      ok: true,
      status: 'pending',
      id: sessionId,
      poll: pollUrl(request, sessionId),
      reportUrl: reportUrl(request, sessionId),
      estimatedSeconds: 180,
      message:
        'Review accepted. Poll the `poll` URL every few seconds; the full verdict is returned when status is "completed" (typically 1-3 minutes).',
    },
    { status: 202 },
  );
};

/* -------------------------------------------------------------------------- */
/* GET — poll a review, or return the service descriptor                      */
/* -------------------------------------------------------------------------- */

const serviceDescriptor = (request: Request): NextResponse => {
  const origin = originOf(request);
  return NextResponse.json(
    {
      name: 'SONDA — AI Product Launch Jury',
      description:
        'Autonomous multi-agent product review. Submit a public website, private website, GitHub repository, or project ZIP; six specialist AI reviewers (QA Engineer, UX Designer, Marketing/GTM Expert, Investor lens, First-time User, and a final Hackathon Judge) investigate it and return a launch verdict: overall score /100, status, top strengths, top issues, and prioritized fixes.',
      pricing: 'free',
      flow: 'submit-then-poll',
      endpoints: {
        submit: {
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
            'HTTP 202 with { ok, status:"pending", id, poll, reportUrl, estimatedSeconds }. Use the `poll` URL to retrieve the verdict.',
        },
        poll: {
          method: 'GET',
          url: `${origin}/api/asp/review?id=<id>`,
          returns:
            'While running: { ok, status:"pending"|"running", id, poll }. When done: { ok, status:"completed", session, evidence, reviewerResults[], verdict { overallScore, status, headline, summary, topStrengths, topWeaknesses, priorityFixes } }. On failure: { ok:false, status:"failed", reason }.',
          pollEverySeconds: 5,
          typicalCompletionSeconds: 180,
        },
      },
      example: {
        step1_request: { method: 'POST', body: { type: 'website', target: 'https://example.com' } },
        step2_poll: { method: 'GET', url: `${origin}/api/asp/review?id=<id-from-step-1>` },
      },
    },
    { status: 200 },
  );
};

export const GET = async (request: Request): Promise<NextResponse> => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // No id → service descriptor.
  if (!id) {
    return serviceDescriptor(request);
  }

  // With id → poll the session.
  try {
    const payload = await loadReviewWirePayload(id);
    if (!payload) {
      return errorResponse(`Review session ${id} not found.`, 404);
    }

    const status = payload.session.status;

    if (status === 'PENDING' || status === 'RUNNING') {
      return NextResponse.json(
        {
          ok: true,
          status: status.toLowerCase(),
          id,
          poll: pollUrl(request, id),
          reportUrl: reportUrl(request, id),
          message:
            'Review in progress. Keep polling; the verdict appears when status is "completed".',
        },
        { status: 200 },
      );
    }

    if (status === 'FAILED') {
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          id,
          reason: payload.verdict?.summary ?? 'SONDA could not complete this review.',
          reportUrl: reportUrl(request, id),
          ...payload,
        },
        { status: 200 },
      );
    }

    // COMPLETED — full verdict.
    return NextResponse.json(
      {
        ok: true,
        status: 'completed',
        id,
        reportUrl: reportUrl(request, id),
        ...payload,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/asp/review] poll failed', error);
    const message = isProduction
      ? 'Failed to load review session.'
      : error instanceof Error
        ? `Failed to load review session: ${error.message}`
        : 'Failed to load review session.';
    return errorResponse(message, 500);
  }
};

/* -------------------------------------------------------------------------- */
/* Method guards                                                              */
/* -------------------------------------------------------------------------- */

export const PUT = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PATCH = (): NextResponse => errorResponse('Method not allowed.', 405);
export const DELETE = (): NextResponse => errorResponse('Method not allowed.', 405);
