-- Migration: add_local_issue_support
-- Add source field, nullable redmineIssueId/redmineBaseUrl, localIssueNumber

-- Step 1: Add new columns with defaults
ALTER TABLE "Issue" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'redmine';
ALTER TABLE "Issue" ADD COLUMN "localIssueNumber" INTEGER;

-- Step 2: Make redmineIssueId and redmineBaseUrl nullable
ALTER TABLE "Issue" ALTER COLUMN "redmineIssueId" DROP NOT NULL;
ALTER TABLE "Issue" ALTER COLUMN "redmineBaseUrl" DROP NOT NULL;

-- Step 3: Add new unique constraint for local issues
CREATE UNIQUE INDEX "Issue_userId_source_localIssueNumber_key" ON "Issue"("userId", "source", "localIssueNumber");

-- Step 4: Add index on source for filtering
CREATE INDEX "Issue_userId_source_idx" ON "Issue"("userId", "source");

-- Note: Existing issues automatically get source='redmine' via default
-- and keep their redmineIssueId/redmineBaseUrl values intact
