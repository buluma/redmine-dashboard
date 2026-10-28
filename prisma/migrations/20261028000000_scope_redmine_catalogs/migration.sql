-- Scope Redmine metadata caches to the authenticated account and configured
-- Redmine base URL. Existing global rows cannot be safely assigned to an
-- account/server pair, so leave them under the empty legacy scope. The
-- temporary defaults backfill existing rows, then are dropped to match the
-- PostgreSQL Prisma schema; the SQLite development schema retains defaults so
-- db push can preserve rows in existing local databases.
ALTER TABLE "StatusCatalog" ADD COLUMN "scope" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StatusCatalog" ALTER COLUMN "scope" DROP DEFAULT;
ALTER TABLE "StatusCatalog" DROP CONSTRAINT IF EXISTS "StatusCatalog_pkey";
ALTER TABLE "StatusCatalog" ADD CONSTRAINT "StatusCatalog_pkey" PRIMARY KEY ("scope", "id");

ALTER TABLE "EnumerationCatalog" ADD COLUMN "scope" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EnumerationCatalog" ALTER COLUMN "scope" DROP DEFAULT;
DROP INDEX IF EXISTS "EnumerationCatalog_kind_remoteId_idx";
DROP INDEX IF EXISTS "EnumerationCatalog_kind_isActive_idx";
CREATE INDEX "EnumerationCatalog_scope_kind_remoteId_idx" ON "EnumerationCatalog"("scope", "kind", "remoteId");
CREATE INDEX "EnumerationCatalog_scope_kind_isActive_idx" ON "EnumerationCatalog"("scope", "kind", "isActive");
