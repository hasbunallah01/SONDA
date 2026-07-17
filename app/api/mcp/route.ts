/**
 * app/api/mcp/route.ts — SONDA MCP server (OKX.AI A2MCP endpoint).
 *
 * OKX.AI's A2MCP calls services over the Model Context Protocol
 * (Streamable HTTP + JSON-RPC 2.0), not as a plain REST endpoint. The
 * platform connects to this URL, runs `tools/list` to discover the
 * tools, then `tools/call` to invoke one. The earlier REST endpoint
 * (`/api/asp/review`) is kept for direct/human use, but THIS is the
 * endpoint registered with OKX.
 *
 * Tools exposed
 *   review_product — submit a product for review and return the verdict.
 *       Because the full pipeline takes 1-3 min and a serverless
 *       function cannot block that long, the tool submits the job,
 *       then polls internally for a bounded window. If the verdict is
 *       ready in time, it is returned in full. If not, the tool returns
 *       the review id + status + report URL and instructs the caller to
 *       fetch the result with `get_review`. Either way the call returns
 *       promptly with a valid result — it never hangs.
 *   get_review — fetch the current state / final verdict of a review by
 *       id. Lets a caller retrieve a verdict that was still running when
 *       `review_product` returned.
 *
 * Design notes
 *   - Stateless: every request is self-contained (no MCP session state
 *     needed), which suits OKX's call model and serverless hosting.
 *   - The heavy lifting still runs off-Vercel on the GitHub Actions
 *     worker (see .github/workflows/asp-review.yml); this route only
 *     submits + reads, so each HTTP call stays well within the function
 *     time limit.
 */

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { reviewTypeValues, toPrismaReviewType } from '@/lib/review-request';
import { loadReviewWirePayload } from '@/lib/review-wire';
import { runReview } from '@/services/review-orchestrator';

export const maxDuration = 60;

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Compact, agent-friendly projection of a finished verdict. */
const summarizeVerdict = (
  payload: NonNullable<Awaited<ReturnType<typeof loadReviewWirePayload>>>,
) => {
  const v = payload.verdict;
  if (!v) return null;
  return {
    overallScore: v.overallScore,
    status: v.status,
    headline: v.headline,
    summary: v.summary,
    topStrengths: v.topStrengths,
    topWeaknesses: v.topWeaknesses,
    priorityFixes: v.priorityFixes,
    reviewers: payload.reviewerResults.map((r) => ({
      reviewer: r.reviewerRole,
      score: r.score,
      summary: r.summary,
    })),
  };
};

/* -------------------------------------------------------------------------- */
/* MCP handler                                                                */
/* -------------------------------------------------------------------------- */

const handler = createMcpHandler(
  (server) => {
    // ---- Tool 1: review_product -----------------------------------------
    server.tool(
      'review_product',
      'Run an autonomous multi-agent product launch review. A jury of six specialist AI reviewers (QA, UX, Marketing, Investor, First-time User, and a Hackathon Judge) investigates the target and returns a launch verdict: overall score out of 100, launch-readiness status, top strengths, top issues, and prioritized fixes. Returns the full verdict inline in a single call (typically a few seconds).',
      {
        type: z
          .enum(reviewTypeValues)
          .describe(
            "What to review: 'website' (public site), 'github' (public repo), 'zip' (hosted .zip build), or 'private' (authenticated site).",
          ),
        target: z
          .string()
          .min(1)
          .max(2048)
          .describe('The URL of the website, GitHub repo, or hosted .zip to review.'),
        username: z.string().max(256).optional().describe('Login username (private targets only).'),
        password: z.string().max(256).optional().describe('Login password (private targets only).'),
        twoFactorCode: z.string().max(64).optional().describe('2FA code (private targets only).'),
        notes: z.string().max(2000).optional().describe('Optional guidance for the reviewers.'),
      },
      async ({ type, target, username, password, twoFactorCode, notes }) => {
        // 1. Create the session, retrying on transient DB/pool errors.
        //    Neon's serverless Postgres can drop the first connection
        //    from a cold pool; a fast retry with short backoff turns
        //    that transient blip into a successful call instead of an
        //    error response to the caller.
        let sessionId: string | null = null;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const session = await prisma.reviewSession.create({
              data: { type: toPrismaReviewType(type), status: 'PENDING', target },
              select: { id: true },
            });
            sessionId = session.id;
            break;
          } catch (error) {
            lastError = error;
            // Short backoff: 250ms, then 750ms. Total worst-case added
            // latency ~1s, negligible against the review itself.
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 250 + attempt * 500));
            }
          }
        }
        if (!sessionId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to start the review: ${
                  lastError instanceof Error ? lastError.message : 'database error'
                }`,
              },
            ],
            isError: true,
          };
        }

        // 2. Run the pipeline INLINE. The reviewers are deterministic
        //    (no LLM calls) and evidence collection is a few bounded
        //    fetches, so the whole review completes in seconds — well
        //    within the serverless window. Running it here (instead of
        //    dispatching to the GitHub Actions worker, whose runner
        //    cold-start added ~30s) is what lets OKX's tester get a fast
        //    inline response instead of timing out.
        try {
          await runReview(sessionId, {
            privateCredentials:
              type === 'private' && (username || password) ? { username, password } : undefined,
            twoFactorCode,
            notes,
          });
        } catch (error) {
          // A pipeline failure is a valid terminal outcome, not a
          // transport error — report it as a failed review.
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    ok: false,
                    status: 'failed',
                    id: sessionId,
                    reason:
                      error instanceof Error
                        ? error.message
                        : 'SONDA could not complete this review.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // 3. Load the finished verdict and return it inline.
        const payload = await loadReviewWirePayload(sessionId).catch(() => null);
        if (payload && payload.session.status === 'COMPLETED') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    ok: true,
                    status: 'completed',
                    id: sessionId,
                    verdict: summarizeVerdict(payload),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        if (payload && payload.session.status === 'FAILED') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    ok: false,
                    status: 'failed',
                    id: sessionId,
                    reason: payload.verdict?.summary ?? 'SONDA could not complete this review.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Fallback: the review ran but the row wasn't COMPLETED/FAILED
        // (should not happen). Return the id so the caller can fetch it.
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  status: 'running',
                  id: sessionId,
                  message: 'Review submitted. Call get_review with this id to fetch the verdict.',
                  reportUrl: `https://sonda-phi.vercel.app/review/${sessionId}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    // ---- Tool 2: get_review ---------------------------------------------
    server.tool(
      'get_review',
      'Fetch the current state or final verdict of a SONDA review by its id (from a prior review_product call). Returns the full verdict once the review has completed.',
      {
        id: z.string().min(1).describe('The review id returned by review_product.'),
      },
      async ({ id }) => {
        const payload = await loadReviewWirePayload(id).catch(() => null);
        if (!payload) {
          return {
            content: [{ type: 'text' as const, text: `Review ${id} not found.` }],
            isError: true,
          };
        }
        const status = payload.session.status;
        if (status === 'COMPLETED') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  { ok: true, status: 'completed', id, verdict: summarizeVerdict(payload) },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        if (status === 'FAILED') {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    ok: false,
                    status: 'failed',
                    id,
                    reason: payload.verdict?.summary ?? 'SONDA could not complete this review.',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  status: status.toLowerCase(),
                  id,
                  message: 'Still running. Try again in ~30-60 seconds.',
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );
  },
  {
    // Server info advertised in the MCP handshake.
    serverInfo: {
      name: 'sonda',
      version: '1.0.0',
    },
  },
  {
    // mcp-handler options: stateless streamable-HTTP only. SSE is
    // disabled because it would need Redis for resumability, which we
    // don't run on Hobby. OKX's platform (and modern MCP clients) use
    // Streamable HTTP, so nothing is lost.
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
    disableSse: true,
  },
);

const mcpHandler = handler;

/**
 * Compatibility wrapper around the strict mcp-handler.
 *
 * mcp-handler enforces the MCP spec requirement that clients send the
 * Accept header "application/json, text/event-stream", returning 406 for
 * anything else (plain application/json, star-slash-star, or a missing
 * Accept header). Real-world callers -- including OKX.AI's platform
 * tester -- don't always send that exact combination, and a 406 reads to
 * them as "no response", which is what caused the review to time out.
 *
 * This wrapper makes the endpoint tolerant:
 *   1. Before delegating, it rewrites the request Accept header to the
 *      compliant value so mcp-handler never 406s on content negotiation.
 *   2. It records whether the original client actually asked for SSE. If
 *      it did not, the SSE-framed response is unwrapped back into a plain
 *      application/json body, which any HTTP/JSON client can consume.
 *
 * The MCP protocol semantics are unchanged — only content negotiation is
 * relaxed so the widest range of clients can call the server.
 */
const COMPLIANT_ACCEPT = 'application/json, text/event-stream';

const wrapped = async (request: Request): Promise<Response> => {
  const originalAccept = request.headers.get('accept') ?? '';
  const clientWantsSse = originalAccept.includes('text/event-stream');

  // Rewrite Accept so mcp-handler accepts the request.
  const headers = new Headers(request.headers);
  headers.set('accept', COMPLIANT_ACCEPT);
  const proxied = new Request(request.url, {
    method: request.method,
    headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.clone().arrayBuffer(),
  });

  const res = await mcpHandler(proxied);

  // If the client genuinely wanted SSE, pass the stream through untouched.
  if (clientWantsSse) return res;

  const contentType = res.headers.get('content-type') ?? '';
  // Only transform SSE responses; leave JSON/others alone.
  if (!contentType.includes('text/event-stream')) return res;

  // Unwrap the SSE framing into a single JSON body. An SSE message is a
  // series of lines; the JSON-RPC payload rides on the `data:` line(s).
  const raw = await res.text();
  const dataLines = raw
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  const jsonBody = dataLines.length > 0 ? dataLines.join('') : raw.trim();

  return new Response(jsonBody, {
    status: res.status,
    headers: {
      'content-type': 'application/json',
      // Preserve the session header if mcp-handler set one.
      ...(res.headers.get('mcp-session-id')
        ? { 'mcp-session-id': res.headers.get('mcp-session-id') as string }
        : {}),
    },
  });
};

export { wrapped as GET, wrapped as POST, wrapped as DELETE };
