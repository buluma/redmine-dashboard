-- Add calendarEventUid to TimeEntry (SHA-172 calendar-meeting timelogs)
ALTER TABLE "TimeEntry" ADD COLUMN "calendarEventUid" TEXT;

CREATE UNIQUE INDEX "TimeEntry_issueId_calendarEventUid_key" ON "TimeEntry"("issueId", "calendarEventUid");
