#!/bin/sh
set -eu

DATABASE_URL_VALUE="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL_VALUE" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

case "$DATABASE_URL_VALUE" in
  postgres://*|postgresql://*)
    echo "PostgreSQL DATABASE_URL detected, attempting Prisma migrations..."
    if ! npx prisma migrate deploy; then
      echo "Prisma migrate deploy failed; continuing startup with existing schema." >&2
      echo "Set RUN_DB_MIGRATIONS_ON_START=true and resolve migration history if you need strict migration gating." >&2
    fi
    ;;
  file:*|sqlite:*)
    if [ "${DATABASE_URL_VALUE#file:}" != "$DATABASE_URL_VALUE" ]; then
      DB_PATH="${DATABASE_URL_VALUE#file:}"
    else
      DB_PATH="${DATABASE_URL_VALUE#sqlite:}"
    fi

    mkdir -p "$(dirname "$DB_PATH")"
    sqlite3 "$DB_PATH" < prisma/init.sql

    if [ "$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('Issue') WHERE name = 'redmineBaseUrl';")" = "0" ]; then
      sqlite3 "$DB_PATH" "ALTER TABLE \"Issue\" ADD COLUMN \"redmineBaseUrl\" TEXT NOT NULL DEFAULT '';"
    fi

    if [ "$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('IssueJournal') WHERE name = 'detailsJson';")" = "0" ]; then
      sqlite3 "$DB_PATH" "ALTER TABLE \"IssueJournal\" ADD COLUMN \"detailsJson\" TEXT;"
    fi

    sqlite3 "$DB_PATH" <<'SQL'
UPDATE "Issue"
SET "redmineBaseUrl" = COALESCE(
  (SELECT "baseUrl" FROM "UserRedmineCredential" WHERE "UserRedmineCredential"."userId" = "Issue"."userId"),
  "redmineBaseUrl"
)
WHERE "redmineBaseUrl" = '';

DROP INDEX IF EXISTS "Issue_redmineIssueId_key";
DROP INDEX IF EXISTS "IssueJournal_redmineJournalId_key";
DROP INDEX IF EXISTS "IssueAttachment_redmineAttachmentId_key";
DROP INDEX IF EXISTS "IssueRelation_redmineRelationId_key";
DROP INDEX IF EXISTS "TimeEntry_redmineTimeEntryId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Issue_userId_redmineBaseUrl_redmineIssueId_key" ON "Issue"("userId", "redmineBaseUrl", "redmineIssueId");
CREATE UNIQUE INDEX IF NOT EXISTS "IssueJournal_issueId_redmineJournalId_key" ON "IssueJournal"("issueId", "redmineJournalId");
CREATE UNIQUE INDEX IF NOT EXISTS "IssueAttachment_issueId_redmineAttachmentId_key" ON "IssueAttachment"("issueId", "redmineAttachmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "IssueRelation_issueId_redmineRelationId_key" ON "IssueRelation"("issueId", "redmineRelationId");
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_issueId_redmineTimeEntryId_key" ON "TimeEntry"("issueId", "redmineTimeEntryId");
SQL

    SQLITE_SCHEMA_PATH="${PRISMA_SCHEMA_PATH:-prisma/schema.dev.sqlite.prisma}"
    echo "Applying Prisma schema to SQLite DB using ${SQLITE_SCHEMA_PATH}..."
    npx prisma db push --skip-generate --schema="$SQLITE_SCHEMA_PATH"
    ;;
  *)
    echo "Unsupported DATABASE_URL format: $DATABASE_URL_VALUE" >&2
    echo "Supported formats: postgresql://..., postgres://..., file:..., sqlite:..." >&2
    exit 1
    ;;
esac
