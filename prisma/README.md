# `prisma/` — Prisma schema & migrations

Database layer for SONDA. Uses **PostgreSQL** in production (Neon recommended) and the same engine in tests.

## Structure

```
prisma/
├── schema.prisma         # Source of truth for the data model
├── migrations/           # Generated migration history (committed)
└── seed.ts               # Optional seed script
```

## Models

| Model            | Purpose                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `ReviewSession`  | One investigation request, end-to-end. Persists type / target / status.              |
| `ReviewerResult` | One row per juror (`qa` / `ux` / `marketing` / `investor` / `judge` / `first-user`). |
| `ReviewResult`   | The jury's final verdict for a session. One-to-one with `ReviewSession`.             |

Enums:

| Enum                | Values                                                          |
| ------------------- | --------------------------------------------------------------- |
| `ReviewType`        | `WEBSITE` / `GITHUB` / `ZIP` / `PRIVATE_WEBSITE`                |
| `ReviewStatus`      | `PENDING` / `RUNNING` / `COMPLETED` / `FAILED`                  |
| `ReviewerType`      | `QA` / `UX` / `MARKETING` / `INVESTOR` / `JUDGE` / `FIRST_USER` |
| `PriorityFixEffort` | `LOW` / `MEDIUM` / `HIGH`                                       |
| `PriorityFixImpact` | `LOW` / `MEDIUM` / `HIGH`                                       |

`ReviewerResult` is the durable per-juror output: `score` (0–100), `confidence` (0–1), `summary`, `strengths[]`, `weaknesses[]`, and `priorityFixes` JSON. A `ReviewSession` accumulates one row per juror — the unique index on `(sessionId, reviewer)` enforces that at the database level. The verdict engine then folds these rows into the single `ReviewResult` verdict row.

## Commands

```bash
npm run prisma:generate     # Generate the typed Prisma client
npm run prisma:migrate      # Create + apply a dev migration (needs DATABASE_URL)
npm run prisma:deploy       # Apply pending migrations in CI / prod
npm run prisma:studio       # Open the local DB inspector
```

> Auth (`User`, `Account`, `Session`, `VerificationToken`) and richer failure
> metadata will be added once NextAuth and the orchestrator land.
