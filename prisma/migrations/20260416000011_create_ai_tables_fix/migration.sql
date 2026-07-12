-- Create AiSummary table with all required columns
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model" TEXT,
    "confidence" DOUBLE PRECISION,
    "totalDuration" BIGINT,
    "loadDuration" BIGINT,
    "promptEvalCount" INTEGER,
    "promptEvalDuration" BIGINT,
    "evalCount" INTEGER,
    "evalDuration" BIGINT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiSummary_userId_idx" ON "AiSummary"("userId");
CREATE INDEX "AiSummary_issueId_idx" ON "AiSummary"("issueId");

-- Create AiChatMessage table
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "issueId" TEXT,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evalCount" INTEGER,
    "evalDuration" BIGINT,
    "loadDuration" BIGINT,
    "promptEvalCount" INTEGER,
    "promptEvalDuration" BIGINT,
    "totalDuration" BIGINT,
    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatMessage_userId_idx" ON "AiChatMessage"("userId");
CREATE INDEX "AiChatMessage_issueId_idx" ON "AiChatMessage"("issueId");
