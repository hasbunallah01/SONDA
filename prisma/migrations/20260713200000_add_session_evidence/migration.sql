-- Add a `Json` column on `review_sessions` to persist the
-- `EvidenceBundle` once an evidence collector has produced one.
--
-- The column is nullable and unindexed. Reasons:
--   - Nullable: the column is only populated when a real
--     evidence collector runs. Placeholder sessions (the ones
--     created before the collectors land) stay null.
--   - Unindexed: we never query by evidence content; the
--     results API only loads by `sessionId`.
--
-- The `Json` type is PostgreSQL's JSONB under the hood (Prisma
-- maps `Json` → `JSONB`).

ALTER TABLE "review_sessions" ADD COLUMN "evidence" JSONB;
