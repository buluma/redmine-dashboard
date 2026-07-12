-- Add userId to AiSummary for per-user summaries
ALTER TABLE "AiSummary" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX "AiSummary_userId_idx" ON "AiSummary"("userId");

-- Add userId to AiChatMessage for per-user chat
ALTER TABLE "AiChatMessage" ADD COLUMN "userId" TEXT;
CREATE INDEX "AiChatMessage_userId_idx" ON "AiChatMessage"("userId");
