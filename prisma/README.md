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

| Model           | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `ReviewSession` | One investigation request, end-to-end. Persists type / target / status.  |
| `ReviewResult`  | The jury's final verdict for a session. One-to-one with `ReviewSession`. |

Enums: `ReviewType` (`WEBSITE` / `GITHUB` / `ZIP` / `PRIVATE_WEBSITE`) and `ReviewStatus` (`PENDING` / `RUNNING` / `COMPLETED` / `FAILED`).

## Commands

```bash
npm run prisma:generate     # Generate the typed Prisma client
npm run prisma:migrate      # Create + apply a dev migration (needs DATABASE_URL)
npm run prisma:deploy       # Apply pending migrations in CI / prod
npm run prisma:studio       # Open the local DB inspector
```

> Auth (`User`, `Account`, `Session`, `VerificationToken`) and richer failure
> metadata will be added once NextAuth and the orchestrator land.
