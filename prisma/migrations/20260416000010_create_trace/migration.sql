-- Create Trace table for tracing/debugging
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" BIGINT,
    "error" TEXT,
    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Trace_userId_idx" ON "Trace"("userId");
CREATE INDEX "Trace_startedAt_idx" ON "Trace"("startedAt");
