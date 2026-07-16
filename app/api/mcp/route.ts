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
import { env } from '@/lib/env';
import { reviewTypeValues, toPrismaReviewType } from '@/lib/review-request';
import { loadReviewWirePayload } from '@/lib/review-wire';

export const maxDuration = 60;

/* -------------------------------------------------------------------------- */
/* Shared helpers (mirror the REST route, so both stay in lockstep)           */
/* -------------------------------------------------------------------------- */

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
        client_payload: { sessionId, ...credentials },
      }),
    });
    if (res.status === 204) return { ok: true };
    const text = await res.text().catch(() => '');
    return { ok: false, reason: `Dispatch failed (${res.status}). ${text.slice(0, 200)}`.trim() };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Dispatch request failed.',
    };
  }
};

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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* MCP handler                                                                */
/* -------------------------------------------------------------------------- */

const handler = createMcpHandler(
  (server) => {
    // ---- Tool 1: review_product -----------------------------------------
    server.tool(
      'review_product',
      'Run an autonomous multi-agent product launch review. A jury of six specialist AI reviewers (QA, UX, Marketing, Investor, First-time User, and a Hackathon Judge) investigates the target and returns a launch verdict: overall score out of 100, launch-readiness status, top strengths, top issues, and prioritized fixes. Reviewing takes 1-3 minutes; if the verdict is not ready when this returns, use get_review with the returned id to fetch it.',
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
        // 1. Create the session.
        let sessionId: string;
        try {
          const session = await prisma.reviewSession.create({
            data: { type: toPrismaReviewType(type), status: 'PENDING', target },
            select: { id: true },
          });
          sessionId = session.id;
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to start the review: ${
                  error instanceof Error ? error.message : 'database error'
                }`,
              },
            ],
            isError: true,
          };
        }

        // 2. Fire the worker.
        const dispatched = await dispatchWorker(sessionId, {
          username,
          password,
          twoFactorCode,
          notes,
        });
        if (!dispatched.ok) {
          await prisma.reviewSession
            .update({ where: { id: sessionId }, data: { status: 'FAILED' } })
            .catch(() => undefined);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Could not start the review worker: ${dispatched.reason}`,
              },
            ],
            isError: true,
          };
        }

        // 3. Poll internally for a bounded window so a fast review returns
        //    its verdict inline. Cap the wait below the function limit.
        const deadline = Date.now() + 45_000;
        while (Date.now() < deadline) {
          await sleep(3_000);
          const payload = await loadReviewWirePayload(sessionId).catch(() => null);
          if (!payload) continue;
          const status = payload.session.status;
          if (status === 'COMPLETED') {
            const verdict = summarizeVerdict(payload);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    { ok: true, status: 'completed', id: sessionId, verdict },
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
        }

        // 4. Still running — return the id so the caller fetches it with
        //    get_review. This is a valid, prompt response, not a hang.
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  status: 'running',
                  id: sessionId,
                  message:
                    'Review is still running (typically 1-3 minutes total). Call get_review with this id in ~60-120 seconds to fetch the full verdict.',
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

export { handler as GET, handler as POST, handler as DELETE };
