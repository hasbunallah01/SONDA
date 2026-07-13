/**
 * app/api/reviews/route.ts — POST /api/reviews
 *
 * Creates a new `ReviewSession` row from the user's intake (review
 * type + target) and returns its id + initial status.
 *
 * This is the *foundation* of the review backend. It deliberately
 * does NOT:
 *   - Launch a browser / Playwright run.
 *   - Call the GitHub API.
 *   - Open the uploaded ZIP.
 *   - Run any AI reviewer.
 *   - Spawn a worker or queue a job.
 *
 * It only persists the request so a future task (the orchestrator /
 * review engine) can pick the session up and drive it through the
 * lifecycle. The session is created in the `PENDING` status.
 *
 * Request body
 *  ```json
 *  {
 *    "type": "website" | "github" | "zip" | "private",
 *    "target": "https://example.com"
 *  }
 *  ```
 *
 * Successful response (201)
 *  ```json
 *  {
 *    "id": "ckxxxxxxxxxxxxxxxx",
 *    "status": "PENDING",
 *    "type": "WEBSITE",
 *    "createdAt": "2026-07-13T17:50:40.000Z"
 *  }
 *  ```
 *
 * Error responses
 *   400 — validation failed (Zod). Returns the issues list.
 *   405 — wrong method. Other verbs hit this handler as a no-op 405.
 *   500 — unexpected server error. The error message is hidden in
 *         production; in dev, the raw message is returned for easier
 *         debugging.
 *
 * Out of scope (per task)
 *   - Authentication. `userId` is not extracted from the request;
 *     when auth lands, set it from the session.
 *   - File uploads. ZIP and PRIVATE_WEBSITE reviews need richer
 *     inputs (multipart upload, credential payload); those land in
 *     dedicated tasks. For now the `target` string is stored as-is.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma, ReviewType } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { runReview, type RunReviewOptions } from '@/services/review-orchestrator';

/* -------------------------------------------------------------------------- */
/* Request validation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `type` is accepted in the same shape the frontend already uses
 * (lowercase, matching `types/evidence.ts#ReviewSource`). We map it to
 * the Prisma `ReviewType` enum inside the handler so the wire format
 * stays decoupled from the database schema.
 */
const reviewTypeValues = ['website', 'github', 'zip', 'private'] as const;

const createReviewSchema = z.object({
  type: z.enum(reviewTypeValues, {
    errorMap: () => ({
      message: `type must be one of: ${reviewTypeValues.join(', ')}`,
    }),
  }),
  /**
   * Optional credentials for `type: "private"` reviews. Forwarded
   * to the evidence collector via the orchestrator's
   * `RunReviewOptions.privateCredentials` field. All four fields
   * are optional; the collector applies HTTP Basic Auth when
   * both `username` and `password` are supplied.
   */
  username: z.string().min(1).max(256).optional(),
  password: z.string().min(1).max(256).optional(),
  twoFactorCode: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000).optional(),
  /**
   * `target` is whatever the user submitted:
   *   - WEBSITE / PRIVATE_WEBSITE → URL.
   *   - GITHUB                    → repo URL.
   *   - ZIP                       → upload reference (placeholder for now).
   *
   * We only enforce a non-empty, reasonable length here. Per-source
   * validation (URL parsing, GitHub regex, file presence) belongs in
   * the source's own feature module, not at the API boundary.
   */
  target: z
    .string({ required_error: 'target is required' })
    .trim()
    .min(1, 'target is required')
    .max(2048, 'target is too long (max 2048 characters)'),
});

type CreateReviewInput = z.infer<typeof createReviewSchema>;

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Translate the wire-level review type into the Prisma enum. Centralized
 * here so adding a new source = one place to touch.
 */
const toPrismaReviewType = (input: CreateReviewInput['type']): ReviewType => {
  switch (input) {
    case 'website':
      return ReviewType.WEBSITE;
    case 'github':
      return ReviewType.GITHUB;
    case 'zip':
      return ReviewType.ZIP;
    case 'private':
      return ReviewType.PRIVATE_WEBSITE;
  }
};

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

/* -------------------------------------------------------------------------- */
/* Route handler                                                              */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/reviews
 *
 * Creates a `ReviewSession` in the `PENDING` status, then
 * synchronously drives it through the full review pipeline:
 *
 *   1. PENDING → RUNNING (`startReview`).
 *   2. Collect evidence (per `type`).
 *   3. Persist evidence on the session.
 *   4. Run every reviewer.
 *   5. Compute and persist the verdict.
 *   6. RUNNING → COMPLETED (or FAILED on any error).
 *
 * The request waits for the pipeline to finish before returning,
 * so the response reflects the final status. The client can
 * also poll `GET /api/reviews/:id` for progress if the
 * pipeline is moved to a background worker later.
 */
export const POST = async (request: Request): Promise<NextResponse> => {
  // 1. Parse JSON body. A malformed body is a 400, not a 500.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }

  // 2. Validate against the Zod schema. We forward the issue list so
  //    the frontend can surface field-level errors later.
  const parsed = createReviewSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('Invalid request body.', 400, parsed.error.issues);
  }

  const { type, target, username, password, twoFactorCode, notes } = parsed.data;

  // 3. Persist the session in PENDING. We catch DB errors and
  //    surface a generic 500.
  let sessionId: string;
  try {
    const session = await prisma.reviewSession.create({
      data: {
        type: toPrismaReviewType(type),
        status: 'PENDING',
        target,
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });
    sessionId = session.id;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/reviews] failed to create session', error);

    const message = isProduction
      ? 'Failed to create review session.'
      : error instanceof Error
        ? `Failed to create review session: ${error.message}`
        : 'Failed to create review session.';

    return errorResponse(message, 500);
  }

  // 4. Drive the pipeline. The orchestrator handles every
  //    status transition; on any failure the session is
  //    marked FAILED and the response reports it.
  try {
    const options: RunReviewOptions = {
      privateCredentials:
        type === 'private' && (username || password) ? { username, password } : undefined,
      twoFactorCode,
      notes,
    };
    const result = await runReview(sessionId, options);

    // Re-read the session so the response carries the final
    // status (and updated timestamp) that the orchestrator
    // wrote.
    const final = await prisma.reviewSession.findUnique({
      where: { id: sessionId },
      select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
    });
    if (!final) {
      return errorResponse(`Review session ${sessionId} disappeared.`, 500);
    }

    // 200 even on FAILED — the client should GET the session to
    // see the per-reviewer breakdown. 201 is "session created",
    // not "session succeeded".
    return NextResponse.json(
      {
        id: final.id,
        status: final.status,
        type: final.type,
        createdAt: final.createdAt.toISOString(),
        updatedAt: final.updatedAt.toISOString(),
        ok: result.ok,
        reason: result.ok ? undefined : result.reason,
      },
      { status: 201 },
    );
  } catch (error) {
    // An unexpected (non-handler) error from the orchestrator.
    // The session is in a FAILED state by the time we get here.
    // eslint-disable-next-line no-console
    console.error('[api/reviews] orchestrator failed', error);

    const final = await prisma.reviewSession.findUnique({
      where: { id: sessionId },
      select: { id: true, type: true, status: true, createdAt: true, updatedAt: true },
    });
    if (!final) {
      return errorResponse(`Review session ${sessionId} disappeared.`, 500);
    }

    const message = isProduction
      ? 'Review failed unexpectedly.'
      : error instanceof Error
        ? `Review failed unexpectedly: ${error.message}`
        : 'Review failed unexpectedly.';

    return errorResponse(message, 500, {
      sessionId: final.id,
      status: final.status,
    });
  }
};

/**
 * Reject every other verb explicitly so callers get a clean 405
 * instead of a 404. `next/server` already returns a 405 for
 * unhandled methods, but doing it ourselves lets us return the same
 * shape as the rest of the API.
 */
export const GET = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PUT = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PATCH = (): NextResponse => errorResponse('Method not allowed.', 405);
export const DELETE = (): NextResponse => errorResponse('Method not allowed.', 405);
