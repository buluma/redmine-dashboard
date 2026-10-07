ALTER TABLE "WebhookDelivery"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'complete',
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
  ON "WebhookDelivery"("status", "nextAttemptAt");
