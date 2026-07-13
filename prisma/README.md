# `prisma/` — Prisma schema & migrations

Database layer for SONDA. Uses **PostgreSQL** in production (Neon recommended) and the same engine in tests.

## Structure

```
prisma/
├── schema.prisma         # Source of truth for the data model
├── migrations/           # Generated migration history (committed)
└── seed.ts               # Optional seed script
```

## Commands

```bash
pnpm prisma:generate     # Generate the typed Prisma client
pnpm prisma:migrate      # Create + apply a dev migration
pnpm prisma:deploy       # Apply pending migrations in CI / prod
pnpm prisma:studio       # Open the local DB inspector
```

> No models are defined in this task. The schema is empty and will be added when persistence is introduced.
