-- Add wakaTimeProject to TimeEntry (CON-2: same WakaTime project-day was
-- being logged on more than one ticket once a repo's link moved)
ALTER TABLE "TimeEntry" ADD COLUMN "wakaTimeProject" TEXT;

-- Backfill from the comment applyTimeEntries writes ("WakaTime: <project> <date>").
-- Best effort: for older rows <project> is the linked repo's name segment,
-- which matches the WakaTime project name after normalizeProjectName.
UPDATE "TimeEntry"
SET "wakaTimeProject" = substring("comments" FROM '^WakaTime: (.*) [0-9]{4}-[0-9]{2}-[0-9]{2}$')
WHERE "source" = 'wakatime' AND "wakaTimeProject" IS NULL;
