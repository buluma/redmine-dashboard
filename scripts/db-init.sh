#!/bin/sh
set -eu

DATABASE_URL_VALUE="${DATABASE_URL:-file:./dev.db}"

case "$DATABASE_URL_VALUE" in
  file:*)
    DB_PATH="${DATABASE_URL_VALUE#file:}"
    ;;
  *)
    echo "Unsupported DATABASE_URL for sqlite init: $DATABASE_URL_VALUE" >&2
    echo "Expected format: file:./path/to/db.sqlite" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" < prisma/init.sql

if [ "$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pragma_table_info('Issue') WHERE name = 'redmineBaseUrl';")" = "0" ]; then
  sqlite3 "$DB_PATH" "ALTER TABLE \"Issue\" ADD COLUMN \"redmineBaseUrl\" TEXT NOT NULL DEFAULT '';"
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
