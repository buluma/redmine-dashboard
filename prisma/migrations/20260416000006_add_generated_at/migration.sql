-- Add generatedAt column to AiSummary
ALTER TABLE "AiSummary" ADD COLUMN "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
