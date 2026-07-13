/**
 * lib/db.ts — Prisma client singleton.
 *
 * The Prisma client is expensive to construct (it opens a connection
 * pool, loads query engines, etc.) and Next.js dev mode hot-reloads
 * every server module on file change. Without a singleton, every
 * reload would create a new client and the process would eventually
 * exhaust its database connection limit.
 *
 * Pattern
 *  - In dev, the client is stashed on `globalThis` so it survives
 *    hot reloads. We use a known symbol so the global is typed.
 *  - In production, `globalThis` is not shared across serverless
 *    invocations, so a fresh client is created on cold start — which
 *    is exactly what we want there.
 *
 * Usage
 *  ```ts
 *  import { prisma } from '@/lib/db';
 *  const session = await prisma.reviewSession.create({ ... });
 *  ```
 *
 * Out of scope
 *  - No connection pooling tweaks, no read replicas, no logging
 *    middleware. Add those in a later task if the load profile needs
 *    them.
 */

import { PrismaClient } from '@prisma/client';

import { isDevelopment } from '@/lib/env';

/* -------------------------------------------------------------------------- */
/* Singleton plumbing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Symbol used to stash the Prisma client on `globalThis` in dev.
 *
 * Typed via a module-level declaration so TypeScript knows the shape
 * of `globalThis` without us having to cast at the assignment site.
 */
const PRISMA_GLOBAL_KEY = Symbol.for('sonda.prisma');

type PrismaGlobal = {
  [PRISMA_GLOBAL_KEY]?: PrismaClient;
};

const globalForPrisma = globalThis as unknown as PrismaGlobal;

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The single PrismaClient instance for the running process.
 *
 * Logging: we surface `warn` and `error` in every environment, plus
 * `query` in development. A `query` log in production is far too
 * noisy (and would leak payloads in logs).
 */
export const prisma: PrismaClient =
  globalForPrisma[PRISMA_GLOBAL_KEY] ??
  new PrismaClient({
    log: isDevelopment ? ['warn', 'error', 'query'] : ['warn', 'error'],
  });

if (isDevelopment) {
  globalForPrisma[PRISMA_GLOBAL_KEY] = prisma;
}

/* -------------------------------------------------------------------------- */
/* Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Convenience re-exports for the Prisma value/enum types we use in
 * application code. Importing them from `@/lib/db` keeps every
 * consumer on the same module and avoids leaking the `@prisma/client`
 * dependency into feature folders.
 */
export type { Prisma } from '@prisma/client';
export { ReviewType, ReviewStatus } from '@prisma/client';
