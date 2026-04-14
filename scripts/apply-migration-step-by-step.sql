-- Step 1: Add source column (fast - single column with default)
BEGIN;
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'redmine';
COMMIT;

-- Step 2: Add localIssueNumber column (fast)
BEGIN;
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "localIssueNumber" INTEGER;
COMMIT;

-- Step 3: Make redmineIssueId nullable
BEGIN;
ALTER TABLE "Issue" ALTER COLUMN "redmineIssueId" DROP NOT NULL;
COMMIT;

-- Step 4: Make redmineBaseUrl nullable
BEGIN;
ALTER TABLE "Issue" ALTER COLUMN "redmineBaseUrl" DROP NOT NULL;
COMMIT;

-- Step 5: Add index on source (fast)
BEGIN;
CREATE INDEX IF NOT EXISTS "Issue_userId_source_idx" ON "Issue"("userId", "source");
COMMIT;

-- Step 6: Add unique constraint for local issues (may take longer on large tables)
-- Run this step separately if it times out
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS "Issue_userId_source_localIssueNumber_key" ON "Issue"("userId", "source", "localIssueNumber");
COMMIT;
