-- Create MbuLog table
CREATE TABLE "MbuLog" (
    "id" TEXT NOT NULL,
    "level" TEXT,
    "message" TEXT,
    "context" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "MbuLog_timestamp_idx" ON "MbuLog"("timestamp");
CREATE INDEX "MbuLog_level_idx" ON "MbuLog"("level");
