# `lib/` — Generic utilities

Pure, dependency-light helpers that have **no feature knowledge** and can be safely imported from anywhere.

## Examples (planned)

- `lib/utils.ts` — `cn()` for tailwind class merging (shadcn convention)
- `lib/env.ts` — typed access to `process.env` via Zod
- `lib/logger.ts` — minimal structured logger
- `lib/errors.ts` — domain error classes
- `lib/result.ts` — `Result<T, E>` for explicit error flow
- `lib/url.ts` — URL parsing, normalization, safety checks
- `lib/hash.ts` — short-hash helpers

## Rules

- ✅ No React, no Next imports.
- ✅ No Prisma or database access.
- ✅ Pure or near-pure functions.
- ❌ If it knows about a specific feature, it belongs in `features/<name>/`.
