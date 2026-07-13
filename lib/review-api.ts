/**
 * lib/review-api.ts — Client-side helpers for the reviews API.
 *
 * Used by the four intake forms (website, github, zip,
 * private-website) to POST a new review and by the results
 * page to GET the current state of a session.
 *
 * The wire types here mirror the response shape of
 *   - POST /api/reviews
 *   - GET  /api/reviews/:id
 * The backend lives in app/api/reviews/* and services/.
 *
 * Errors are surfaced as a discriminated `CreateReviewError`
 * so the form can render field-level or network errors without
 * try/catching unknown shapes.
 */

export type CreateReviewInput = {
  type: 'website' | 'github' | 'zip' | 'private';
  target: string;
  /** Optional private-website credentials. */
  username?: string;
  password?: string;
  /** Optional 2FA code (private-website only). */
  twoFactorCode?: string;
  /** Optional reviewer notes (any source). */
  notes?: string;
};

export type CreateReviewSuccess = {
  ok: true;
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  type: 'WEBSITE' | 'GITHUB' | 'ZIP' | 'PRIVATE_WEBSITE';
  createdAt: string;
  updatedAt: string;
};

export type CreateReviewError = {
  ok: false;
  /** 'validation' (400), 'server' (500), or 'network' (fetch failed). */
  kind: 'validation' | 'server' | 'network';
  message: string;
  /** Field-level issues, when the server returned them. */
  issues?: { path: (string | number)[]; message: string }[];
};

export type CreateReviewResult = CreateReviewSuccess | CreateReviewError;

/**
 * POST /api/reviews.
 *
 * Returns a discriminated union. On a 201 the result is the
 * final session id + status (the pipeline is synchronous, so
 * the status is COMPLETED or FAILED by the time we get the
 * response). On any non-2xx the result is a structured error
 * with a kind the form can render.
 */
export const createReview = async (input: CreateReviewInput): Promise<CreateReviewResult> => {
  let response: Response;
  try {
    response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (error) {
    return {
      ok: false,
      kind: 'network',
      message: error instanceof Error ? error.message : 'Network error',
    };
  }

  if (response.status === 201) {
    const body = (await response.json()) as Omit<CreateReviewSuccess, 'ok'>;
    return { ok: true, ...body };
  }

  // Non-201: try to parse a structured error.
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const errorMessage =
    (body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { message?: string; details?: unknown } }).error?.message
      : undefined) ?? `Server returned ${response.status} ${response.statusText}.`;
  const details =
    body && typeof body === 'object' && 'error' in body
      ? (body as { error?: { details?: unknown } }).error?.details
      : undefined;
  return {
    ok: false,
    kind: response.status === 400 ? 'validation' : 'server',
    message: errorMessage,
    issues:
      response.status === 400 && Array.isArray(details)
        ? (details as { path: (string | number)[]; message: string }[])
        : undefined,
  };
};
