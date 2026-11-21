-- A Gr8rTaskLink without a taskKey is now a failed push the poller retries:
-- count attempts, keep the last error, and track when the row last changed.
-- updatedAt gets a temporary default so existing rows backfill, then the
-- default is dropped to match the Prisma schema (@updatedAt, no db default).
ALTER TABLE "Gr8rTaskLink" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Gr8rTaskLink" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX "Gr8rTaskLink_taskKey_updatedAt_idx" ON "Gr8rTaskLink"("taskKey", "updatedAt");
