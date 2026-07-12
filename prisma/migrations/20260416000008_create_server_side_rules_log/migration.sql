-- Create ServerSideRulesLog table
CREATE TABLE "ServerSideRulesLog" (
    "id" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "issueId" TEXT,
    "details" JSONB,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ServerSideRulesLog_executedAt_idx" ON "ServerSideRulesLog"("executedAt");
CREATE INDEX "ServerSideRulesLog_ruleName_idx" ON "ServerSideRulesLog"("ruleName");
