-- Add the canonical `filters` JSON snapshot column to SavedView (see
-- schema.prisma's SavedView.filters doc comment) — introduced alongside the
-- server-backed saved views feature but never migrated for Postgres.
ALTER TABLE "SavedView" ADD COLUMN "filters" JSONB;
