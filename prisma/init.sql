PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "emailOrUsername" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_emailOrUsername_key" ON "User"("emailOrUsername");

CREATE TABLE IF NOT EXISTS "UserRedmineCredential" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "baseUrl" TEXT NOT NULL,
  "apiKeyEncrypted" TEXT NOT NULL,
  "apiKeyIv" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastValidatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserRedmineCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Issue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineIssueId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "projectName" TEXT,
  "tracker" TEXT,
  "priority" TEXT,
  "statusId" INTEGER NOT NULL,
  "statusName" TEXT NOT NULL,
  "assignedToId" INTEGER,
  "assignedToName" TEXT,
  "updatedOnRemote" DATETIME NOT NULL,
  "dueDate" DATETIME,
  "doneRatio" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Issue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Issue_redmineIssueId_key" ON "Issue"("redmineIssueId");
CREATE INDEX IF NOT EXISTS "Issue_userId_statusId_idx" ON "Issue"("userId", "statusId");
CREATE INDEX IF NOT EXISTS "Issue_userId_updatedOnRemote_idx" ON "Issue"("userId", "updatedOnRemote");

CREATE TABLE IF NOT EXISTS "IssueJournal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineJournalId" INTEGER NOT NULL,
  "issueId" TEXT NOT NULL,
  "author" TEXT,
  "notes" TEXT,
  "createdOnRemote" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueJournal_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueJournal_redmineJournalId_key" ON "IssueJournal"("redmineJournalId");
CREATE INDEX IF NOT EXISTS "IssueJournal_issueId_createdOnRemote_idx" ON "IssueJournal"("issueId", "createdOnRemote");

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineTimeEntryId" INTEGER,
  "issueId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hours" REAL NOT NULL,
  "activityId" INTEGER NOT NULL,
  "activityName" TEXT,
  "comments" TEXT,
  "spentOn" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_redmineTimeEntryId_key" ON "TimeEntry"("redmineTimeEntryId");
CREATE INDEX IF NOT EXISTS "TimeEntry_userId_spentOn_idx" ON "TimeEntry"("userId", "spentOn");
CREATE INDEX IF NOT EXISTS "TimeEntry_issueId_idx" ON "TimeEntry"("issueId");

CREATE TABLE IF NOT EXISTS "SyncState" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "lastIncrementalSyncAt" DATETIME,
  "lastFullSyncAt" DATETIME,
  "lastSyncStatus" TEXT NOT NULL DEFAULT 'idle',
  "lastError" TEXT,
  "runningJobId" TEXT,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SyncJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "startedAt" DATETIME,
  "endedAt" DATETIME,
  "error" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SyncJob_userId_createdAt_idx" ON "SyncJob"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "StatusCatalog" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "isClosed" BOOLEAN NOT NULL,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "LeaderLock" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "heartbeatAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL
);
