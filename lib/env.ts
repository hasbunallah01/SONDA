/**
 * lib/env.ts — Typed access to `process.env` (Zod-validated).
 *
 * Every server-side module that needs an environment variable should
 * import `env` from this file rather than reading `process.env`
 * directly. The schema is validated once at module load time, so a
 * missing or malformed variable surfaces immediately during the boot
 * of the Next.js server, not later when the code path actually runs.
 *
 * Design
 *  - `lib/` rules forbid feature knowledge; this file deliberately
 *    has none. It only knows about the *names* of the variables.
 *  - The schema is intentionally narrow for Task 6.1: only
 *    `DATABASE_URL` is required at runtime (the Prisma client needs
 *    it). Optional keys (`OPENAI_API_KEY`, `NEXTAUTH_SECRET`, etc.)
 *    are declared so the app boot does not break when they are
 *    absent, but they are still typed so callers can rely on the
 *    shape instead of `string | undefined`.
 *  - In Next.js, server modules and edge modules can both import
 *    `env`. Edge runtime supports `process.env` reads but Zod parses
 *    run in the same module graph, so this file is safe in both.
 *
 * Out of scope
 *  - No secrets rotation, no KMS, no .env loader — Next.js and the
 *    Prisma CLI already do the loading.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The minimum set of variables SONDA needs to boot the Prisma client
 * and serve the first API routes. New keys can be added as the project
 * grows; just keep `runtime` strict and `optional` permissive so dev
 * environments do not need to define every future key up front.
 */
const envSchema = z.object({
  // --- Runtime: required to boot -----------------------------------------
  /** PostgreSQL connection string. Used by Prisma at every query. */
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required. Set it in .env.local (see .env.example).'),

  /** Current Node environment. Defaults to 'development' in `next dev`. */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Optional: declared so the type is stable --------------------------
  /** OpenAI API key — used by every AI reviewer agent (not this task). */
  OPENAI_API_KEY: z.string().optional(),

  /** NextAuth — planned, not used in this task. */
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  /** GitHub personal access token — raises REST rate limits (later task). */
  GITHUB_TOKEN: z.string().optional(),

  // --- ASP async worker (GitHub Actions dispatch) ------------------------
  /**
   * PAT (repo + workflow scope) the ASP endpoint uses to fire a
   * `repository_dispatch` event, waking the off-Vercel review worker.
   * Optional so the app still boots without it (the endpoint returns a
   * clear 503 if a review is submitted while it is unset).
   */
  GITHUB_DISPATCH_TOKEN: z.string().optional(),
  /**
   * `owner/repo` the dispatch is sent to. Defaults to the SONDA repo.
   */
  GITHUB_DISPATCH_REPO: z.string().default('hasbunallah01/SONDA'),
});

/* -------------------------------------------------------------------------- */
/* Parsed & exported value                                                    */
/* -------------------------------------------------------------------------- */

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print every issue at once so the operator can fix all in one pass.
  // We throw rather than silently defaulting: a missing DATABASE_URL
  // would only fail at the first Prisma query, which is harder to
  // diagnose and could lose data in flight.
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

/**
 * Convenience accessor: `isProduction` is used in a few places
 * (logging verbosity, error reporting) so the constant lives here
 * rather than being re-derived in every module.
 */
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
