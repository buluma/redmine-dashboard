SET statement_timeout = '0';

-- Step 1: Add source column (fast - single column with default)
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'redmine';

-- Step 2: Add localIssueNumber column (fast)
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "localIssueNumber" INTEGER;

-- Step 3: Make redmineIssueId nullable
ALTER TABLE "Issue" ALTER COLUMN "redmineIssueId" DROP NOT NULL;

-- Step 4: Make redmineBaseUrl nullable
ALTER TABLE "Issue" ALTER COLUMN "redmineBaseUrl" DROP NOT NULL;

-- Step 5: Add index on source (fast)
CREATE INDEX IF NOT EXISTS "Issue_userId_source_idx" ON "Issue"("userId", "source");

-- Step 6: Add unique constraint for local issues
CREATE UNIQUE INDEX IF NOT EXISTS "Issue_userId_source_localIssueNumber_key" ON "Issue"("userId", "source", "localIssueNumber");
