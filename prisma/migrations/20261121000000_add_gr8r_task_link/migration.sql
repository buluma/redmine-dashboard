-- Records which gr8r task each Redmine ticket was pushed to, so a ticket
-- assigned to the user becomes at most one gr8r task.
CREATE TABLE "Gr8rTaskLink" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "taskKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gr8rTaskLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Gr8rTaskLink_issueId_key" ON "Gr8rTaskLink"("issueId");

ALTER TABLE "Gr8rTaskLink" ADD CONSTRAINT "Gr8rTaskLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
