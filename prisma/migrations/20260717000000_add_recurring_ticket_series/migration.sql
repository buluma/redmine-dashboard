-- Create RecurringTicketSeries table
CREATE TABLE "RecurringTicketSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    "redmineProjectId" INTEGER NOT NULL,
    "parentIssueId" INTEGER NOT NULL,
    "trackerId" INTEGER NOT NULL,
    "priorityId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "assignedToId" INTEGER,

    "subjectTemplate" TEXT NOT NULL,
    "descriptionTemplate" TEXT,
    "estimatedHours" DOUBLE PRECISION,
    "customFieldsJson" JSONB,

    "cadence" TEXT NOT NULL DEFAULT 'weekly',
    "createWeekday" INTEGER NOT NULL DEFAULT 1,
    "closeWeekday" INTEGER NOT NULL DEFAULT 7,
    "createDayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "closeDayOfMonth" INTEGER,

    "wakatimeProjectName" TEXT NOT NULL,
    "defaultActivityId" INTEGER NOT NULL DEFAULT 9,
    "defaultActivityName" TEXT NOT NULL DEFAULT 'Development',
    "expectsTime" BOOLEAN NOT NULL DEFAULT false,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTicketSeries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecurringTicketSeries_userId_key_key" ON "RecurringTicketSeries"("userId", "key");
CREATE INDEX "RecurringTicketSeries_userId_isActive_idx" ON "RecurringTicketSeries"("userId", "isActive");

ALTER TABLE "RecurringTicketSeries" ADD CONSTRAINT "RecurringTicketSeries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Create RecurringTicketInstance table
CREATE TABLE "RecurringTicketInstance" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    "periodKey" TEXT NOT NULL,
    "redmineIssueId" INTEGER NOT NULL,
    "issueId" TEXT,
    "githubLinkId" TEXT,

    "subject" TEXT NOT NULL,
    "scheduledCreateDate" TIMESTAMP(3) NOT NULL,
    "scheduledCloseDate" TIMESTAMP(3) NOT NULL,

    "status" TEXT NOT NULL DEFAULT 'open',
    "closeAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "finalHoursApplied" DOUBLE PRECISION,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "RecurringTicketInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecurringTicketInstance_issueId_key" ON "RecurringTicketInstance"("issueId");
CREATE UNIQUE INDEX "RecurringTicketInstance_seriesId_periodKey_key" ON "RecurringTicketInstance"("seriesId", "periodKey");
CREATE INDEX "RecurringTicketInstance_seriesId_status_idx" ON "RecurringTicketInstance"("seriesId", "status");
CREATE INDEX "RecurringTicketInstance_userId_status_idx" ON "RecurringTicketInstance"("userId", "status");

ALTER TABLE "RecurringTicketInstance" ADD CONSTRAINT "RecurringTicketInstance_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "RecurringTicketSeries"("id") ON DELETE CASCADE;
ALTER TABLE "RecurringTicketInstance" ADD CONSTRAINT "RecurringTicketInstance_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL;
