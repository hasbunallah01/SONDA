/**
 * app/api/reviews/[id]/route.ts — GET /api/reviews/:id
 *
 * Task 6.13 — Results API.
 *
 * Returns the full state of a `ReviewSession` in the stable wire
 * shape (session / evidence / reviewerResults / verdict). The
 * projection itself lives in `lib/review-wire.ts` and is shared
 * with the agent-facing ASP route so both endpoints stay in
 * lockstep.
 *
 * HTTP status
 *   - 200 — session found; `verdict` may be `null` if the pipeline
 *           has not finished yet.
 *   - 404 — session id does not exist.
 *   - 405 — wrong method.
 *   - 500 — unexpected server error.
 *
 * Out of scope
 *   - No auth (the user knows the cuid; cuid entropy is the
 *     access control for this task).
 *   - No side effects. The GET is a pure read.
 */

import { NextResponse } from 'next/server';

import { isProduction } from '@/lib/env';
import { loadReviewWirePayload } from '@/lib/review-wire';

/* -------------------------------------------------------------------------- */
/* Route context                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Next.js 14 App Router hands every route handler a context
 * object whose shape depends on the route's dynamic segments.
 * We destructure `params` from it and read the `id` segment
 * our own way so the handler signature stays small.
 */
type RouteContext = {
  params: { id: string };
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
 * GET /api/reviews/:id
 *
 * Returns the full review session. The shape is stable:
 * `session` is always present (404 otherwise), `verdict` is
 * `null` if the verdict has not been computed yet, and
 * `reviewerResults` is an empty array if no reviewer has run.
 */
export const GET = async (_request: Request, context: RouteContext): Promise<NextResponse> => {
  const { id } = context.params;

  if (!id || typeof id !== 'string') {
    return errorResponse('Review session id is required.', 400);
  }

  try {
    const payload = await loadReviewWirePayload(id);

    if (!payload) {
      return errorResponse(`Review session ${id} not found.`, 404);
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/reviews/:id] failed to load review', error);

    const message = isProduction
      ? 'Failed to load review session.'
      : error instanceof Error
        ? `Failed to load review session: ${error.message}`
        : 'Failed to load review session.';

    return errorResponse(message, 500);
  }
};

/**
 * Reject every other verb explicitly so callers get a clean 405.
 */
export const POST = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PUT = (): NextResponse => errorResponse('Method not allowed.', 405);
export const PATCH = (): NextResponse => errorResponse('Method not allowed.', 405);
export const DELETE = (): NextResponse => errorResponse('Method not allowed.', 405);
