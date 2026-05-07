#!/usr/bin/env node
/**
 * Idempotent SQLite column migrations for the standalone Docker image.
 * Uses PrismaClient (always available) instead of the full Prisma CLI.
 * Safe to run on every container start — errors for already-existing columns are swallowed.
 */
const { PrismaClient } = require('@prisma/client');

const MIGRATIONS = [
  `ALTER TABLE "Issue" ADD COLUMN "redmineBaseUrl" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "IssueJournal" ADD COLUMN "detailsJson" TEXT`,
  `CREATE TABLE IF NOT EXISTS "MobilePushToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MobilePushToken_fcmToken_key" ON "MobilePushToken"("fcmToken")`,
  `CREATE INDEX IF NOT EXISTS "MobilePushToken_userId_idx" ON "MobilePushToken"("userId")`,
  `DROP INDEX IF EXISTS "Issue_redmineIssueId_key"`,
  `DROP INDEX IF EXISTS "IssueJournal_redmineJournalId_key"`,
  `DROP INDEX IF EXISTS "IssueAttachment_redmineAttachmentId_key"`,
  `DROP INDEX IF EXISTS "IssueRelation_redmineRelationId_key"`,
  `DROP INDEX IF EXISTS "TimeEntry_redmineTimeEntryId_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Issue_userId_redmineBaseUrl_redmineIssueId_key" ON "Issue"("userId", "redmineBaseUrl", "redmineIssueId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IssueJournal_issueId_redmineJournalId_key" ON "IssueJournal"("issueId", "redmineJournalId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IssueAttachment_issueId_redmineAttachmentId_key" ON "IssueAttachment"("issueId", "redmineAttachmentId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "IssueRelation_issueId_redmineRelationId_key" ON "IssueRelation"("issueId", "redmineRelationId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_issueId_redmineTimeEntryId_key" ON "TimeEntry"("issueId", "redmineTimeEntryId")`,
];

async function run() {
  const prisma = new PrismaClient();
  let failed = 0;

  for (const sql of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      const msg = e.message || '';
      // Swallow "already exists" / "duplicate column" — everything else is fatal
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate column') ||
        msg.includes('no such index')
      ) {
        continue;
      }
      console.error('Migration failed:', sql.slice(0, 80), '\n', msg);
      failed++;
    }
  }

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }

  console.log('SQLite migrations applied.');
}

run();
