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
  "redmineBaseUrl" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "projectName" TEXT,
  "tracker" TEXT,
  "priority" TEXT,
  "statusId" INTEGER NOT NULL,
  "statusName" TEXT NOT NULL,
  "parentIssueId" INTEGER,
  "parentIssueLabel" TEXT,
  "assignedToId" INTEGER,
  "assignedToName" TEXT,
  "updatedOnRemote" DATETIME NOT NULL,
  "dueDate" DATETIME,
  "doneRatio" INTEGER,
  "lastActivityAt" DATETIME,
  "lastActivityType" TEXT,
  "allowedStatusesJson" JSON,
  "childrenJson" JSON,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Issue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Issue_userId_redmineBaseUrl_redmineIssueId_key" ON "Issue"("userId", "redmineBaseUrl", "redmineIssueId");
CREATE INDEX IF NOT EXISTS "Issue_userId_statusId_idx" ON "Issue"("userId", "statusId");
CREATE INDEX IF NOT EXISTS "Issue_userId_updatedOnRemote_idx" ON "Issue"("userId", "updatedOnRemote");
CREATE INDEX IF NOT EXISTS "Issue_userId_lastActivityAt_idx" ON "Issue"("userId", "lastActivityAt");

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
CREATE UNIQUE INDEX IF NOT EXISTS "IssueJournal_issueId_redmineJournalId_key" ON "IssueJournal"("issueId", "redmineJournalId");
CREATE INDEX IF NOT EXISTS "IssueJournal_issueId_createdOnRemote_idx" ON "IssueJournal"("issueId", "createdOnRemote");

CREATE TABLE IF NOT EXISTS "IssueGithubLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "issueId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "githubIssueNumber" INTEGER,
  "githubPrNumber" INTEGER,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IssueGithubLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IssueGithubLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueGithubLink_issueId_url_key" ON "IssueGithubLink"("issueId", "url");
CREATE INDEX IF NOT EXISTS "IssueGithubLink_issueId_createdAt_idx" ON "IssueGithubLink"("issueId", "createdAt");
CREATE INDEX IF NOT EXISTS "IssueGithubLink_userId_createdAt_idx" ON "IssueGithubLink"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "IssueAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineAttachmentId" INTEGER NOT NULL,
  "issueId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "filesize" INTEGER NOT NULL,
  "contentType" TEXT,
  "author" TEXT,
  "createdOnRemote" DATETIME,
  "downloadUrl" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IssueAttachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueAttachment_issueId_redmineAttachmentId_key" ON "IssueAttachment"("issueId", "redmineAttachmentId");
CREATE INDEX IF NOT EXISTS "IssueAttachment_issueId_createdOnRemote_idx" ON "IssueAttachment"("issueId", "createdOnRemote");

CREATE TABLE IF NOT EXISTS "IssueRelation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineRelationId" INTEGER NOT NULL,
  "issueId" TEXT NOT NULL,
  "targetIssueId" INTEGER NOT NULL,
  "relationType" TEXT NOT NULL,
  "delay" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IssueRelation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueRelation_issueId_redmineRelationId_key" ON "IssueRelation"("issueId", "redmineRelationId");
CREATE INDEX IF NOT EXISTS "IssueRelation_issueId_relationType_idx" ON "IssueRelation"("issueId", "relationType");

CREATE TABLE IF NOT EXISTS "IssueActivityEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "issueId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceRemoteId" TEXT,
  "eventAt" DATETIME NOT NULL,
  "summary" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssueActivityEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueActivityEvent_dedupeKey_key" ON "IssueActivityEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "IssueActivityEvent_issueId_eventAt_idx" ON "IssueActivityEvent"("issueId", "eventAt");
CREATE INDEX IF NOT EXISTS "IssueActivityEvent_issueId_eventType_idx" ON "IssueActivityEvent"("issueId", "eventType");

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "redmineTimeEntryId" INTEGER,
  "issueId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hours" REAL NOT NULL,
  "activityId" INTEGER NOT NULL,
  "activityName" TEXT,
  "authorName" TEXT,
  "comments" TEXT,
  "spentOn" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntry_issueId_redmineTimeEntryId_key" ON "TimeEntry"("issueId", "redmineTimeEntryId");
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

CREATE TABLE IF NOT EXISTS "EnumerationCatalog" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "remoteId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "EnumerationCatalog_kind_remoteId_idx" ON "EnumerationCatalog"("kind", "remoteId");
CREATE INDEX IF NOT EXISTS "EnumerationCatalog_kind_isActive_idx" ON "EnumerationCatalog"("kind", "isActive");

CREATE TABLE IF NOT EXISTS "LeaderLock" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "heartbeatAt" DATETIME NOT NULL,
  "expiresAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "MobileApiToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "lastUsedAt" DATETIME,
  "expiresAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MobileApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MobileApiToken_tokenHash_key" ON "MobileApiToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "MobileApiToken_userId_revokedAt_idx" ON "MobileApiToken"("userId", "revokedAt");

CREATE TABLE IF NOT EXISTS "IssueEmbedding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "issueId" TEXT NOT NULL,
  "embedding" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "IssueEmbedding_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IssueEmbedding_issueId_key" ON "IssueEmbedding"("issueId");
CREATE INDEX IF NOT EXISTS "IssueEmbedding_issueId_idx" ON "IssueEmbedding"("issueId");
