/**
 * Webhook Subscription Service
 * 
 * Allows external systems to subscribe to ticket events and receive
 * real-time data via HTTP callbacks (webhooks).
 * 
 * Features:
 * - Subscribe/unsubscribe to specific events
 * - HMAC signature for payload verification
 * - Retry logic with exponential backoff
 * - Event delivery history logging
 */

import crypto from 'crypto';
import type { Prisma, WebhookSubscription as PrismaWebhookSubscription } from '@/src/generated/prisma/client';
import { prisma } from './db';
import { getAuditService } from './audit';
import { trackInfo, trackSuccess, trackFailure } from './telemetry';
import { sendWebhookRequest, validateWebhookUrl } from './webhook-url';

// Auto-disable a subscription after this many consecutive delivery failures.
const FAILURE_THRESHOLD = 5;
const DELIVERY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 1000] as const;
const QUEUE_POLL_INTERVAL_MS = 5000;
const CLAIM_STALE_AFTER_MS = 60_000;
const QUEUE_BATCH_SIZE = 10;

// A batch can outlast the poll interval when receivers are slow, so overlapping polls are skipped.
let deliveryPollInFlight = false;

declare global {
  var __webhook_delivery_worker_started__: boolean | undefined;
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  createdBy: string;
  lastTriggeredAt: Date | null;
  lastStatus: number | null;
  failureCount: number;
}

export type WebhookEvent =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.status_changed'
  | 'ticket.assigned'
  | 'ticket.deleted'
  | 'ticket.completed';

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  ticket: {
    id: string;
    redmineIssueId: number | null;
    subject: string;
    description: string | null;
    projectName: string | null;
    trackerName: string | null;
    statusName: string;
    priorityName: string | null;
    assignedToId: string | null;
    assignedToName: string | null;
    authorId: string | null;
    authorName: string | null;
    dueDate: string | null;
    doneRatio: number | null;
    createdAt: string;
    updatedAt: string;
  };
  changes?: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
  metadata?: {
    triggeredBy?: string;
    triggerReason?: string;
  };
}

// ─── Database Operations ─────────────────────────────────────────────────

export async function createSubscription(
  name: string,
  url: string,
  secret: string,
  events: WebhookEvent[],
  createdBy: string
): Promise<WebhookSubscription> {
  const sub = await prisma.webhookSubscription.create({
    data: {
      name,
      url,
      secret,
      events: JSON.stringify(events),
      active: true,
      createdBy,
    },
  });

  await getAuditService().log({
    action: 'CREATE',
    entityType: 'WebhookSubscription',
    entityId: sub.id,
    metadata: { name, url: maskUrl(url), events },
  });

  return toSubscription(sub);
}

export async function deleteSubscription(id: string): Promise<void> {
  const sub = await prisma.webhookSubscription.delete({
    where: { id },
  });

  await getAuditService().log({
    action: 'DELETE',
    entityType: 'WebhookSubscription',
    entityId: id,
    metadata: { name: sub.name },
  });
}

export async function listSubscriptions(): Promise<WebhookSubscription[]> {
  const subs = await prisma.webhookSubscription.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return subs.map(toSubscription);
}

export async function getActiveSubscriptions(): Promise<WebhookSubscription[]> {
  const subs = await prisma.webhookSubscription.findMany({
    where: { active: true },
  });
  return subs.map(toSubscription);
}

export async function toggleSubscription(id: string, active: boolean): Promise<void> {
  await prisma.webhookSubscription.update({
    where: { id },
    data: { active },
  });

  await getAuditService().log({
    action: 'UPDATE',
    entityType: 'WebhookSubscription',
    entityId: id,
    metadata: { enabled: active },
  });
}

export async function updateSubscription(
  id: string,
  data: { name?: string; url?: string; secret?: string; events?: string[] }
): Promise<WebhookSubscription> {
  const updateData: Prisma.WebhookSubscriptionUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.url !== undefined) updateData.url = data.url;
  if (data.secret !== undefined) updateData.secret = data.secret;
  if (data.events !== undefined) updateData.events = JSON.stringify(data.events);

  const updated = await prisma.webhookSubscription.update({
    where: { id },
    data: updateData,
  });

  await getAuditService().log({
    action: 'UPDATE',
    entityType: 'WebhookSubscription',
    entityId: id,
    metadata: { updatedFields: Object.keys(data) },
  });

  return toSubscription(updated);
}

export async function getSubscription(id: string): Promise<WebhookSubscription | null> {
  const sub = await prisma.webhookSubscription.findUnique({
    where: { id },
  });
  return sub ? toSubscription(sub) : null;
}

export async function updateSubscriptionFailure(
  id: string,
  status: number | null,
  success: boolean
): Promise<void> {
  await prisma.webhookSubscription.update({
    where: { id },
    data: {
      lastTriggeredAt: new Date(),
      lastStatus: status,
      failureCount: success ? 0 : { increment: 1 },
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function toSubscription(row: PrismaWebhookSubscription): WebhookSubscription {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    secret: row.secret,
    events: typeof row.events === 'string' ? JSON.parse(row.events) : row.events,
    active: row.active,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    lastTriggeredAt: row.lastTriggeredAt,
    lastStatus: row.lastStatus,
    failureCount: row.failureCount ?? 0,
  };
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ─── Webhook Delivery ───────────────────────────────────────────────────

/** Validate and deliver a webhook while retaining the response and retry semantics. */
async function deliverWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload
): Promise<{ success: boolean; status?: number; responseBody?: string; error?: string; retryable: boolean }> {
  const body = JSON.stringify(payload);
  const signature = generateSignature(body, subscription.secret);

  const destination = await validateWebhookUrl(subscription.url);
  if (!destination.valid) {
    return { success: false, error: destination.error, retryable: false };
  }

  try {
    const response = await sendWebhookRequest(subscription.url, body, {
      'Content-Type': 'application/json',
      'User-Agent': 'Converge-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Delivery': payload.id,
      'X-Webhook-Timestamp': payload.timestamp,
      'X-Webhook-Signature': `sha256=${signature}`,
    });
    const responseBody = response.responseBody;
    const success = response.status >= 200 && response.status < 300;
    return {
      success,
      status: response.status,
      responseBody,
      error: success ? undefined : `HTTP ${response.status}: ${responseBody.substring(0, 100)}`,
      retryable: response.status === 429 || response.status >= 500,
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

// ─── Main Dispatcher ───────────────────────────────────────────────────

export async function dispatchWebhook(
  event: WebhookEvent,
  ticket: WebhookPayload['ticket'],
  changes?: WebhookPayload['changes'],
  triggeredBy?: string
): Promise<void> {
  const subscriptions = await getActiveSubscriptions();

  // Filter subscriptions that want this event
  const interested = subscriptions.filter((sub) => sub.events.includes(event));

  if (interested.length === 0) {
    return;
  }

  const payload: WebhookPayload = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    event,
    timestamp: new Date().toISOString(),
    ticket,
    changes,
    metadata: triggeredBy ? { triggeredBy } : undefined,
  };

  trackInfo("webhook.dispatch.started", { event, subscriberCount: interested.length });

  // Persist each delivery before returning so issue sync is independent of webhook availability.
  await Promise.all(
    interested.map((sub) => prisma.webhookDelivery.create({
      data: {
        subscriptionId: sub.id,
        event,
        payload: payload as unknown as Prisma.InputJsonValue,
        attempt: 0,
        status: 'pending',
        nextAttemptAt: new Date(),
        deliveredAt: new Date(),
      },
    }))
  );

  trackSuccess({ event: "webhook.delivery.queued", metricName: "webhook_delivery_queued", data: { count: interested.length } });
}

/** Process due queue items with optimistic DB claims so only one instance sends each attempt. */
export async function processWebhookDeliveries(): Promise<number> {
  if (deliveryPollInFlight) return 0;
  deliveryPollInFlight = true;
  try {
    return await processDueWebhookDeliveries();
  } finally {
    deliveryPollInFlight = false;
  }
}

function dueDeliveryCondition(now: Date) {
  return {
    OR: [
      { status: 'pending', nextAttemptAt: { lte: now } },
      { status: 'processing', claimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_AFTER_MS) } },
    ],
  };
}

async function processDueWebhookDeliveries(): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: dueDeliveryCondition(new Date()),
    orderBy: { nextAttemptAt: 'asc' },
    take: QUEUE_BATCH_SIZE,
  });
  let processed = 0;

  for (const delivery of due) {
    // Stamp each claim when it is taken; a batch-start timestamp would make later items look stale to other workers.
    // Counting the claim as an attempt bounds reclaims after crashes or worker errors.
    const claimedAt = new Date();
    const claim = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, ...dueDeliveryCondition(claimedAt) },
      data: { status: 'processing', claimedAt, attempt: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    processed++;

    try {
      if (delivery.attempt >= DELIVERY_ATTEMPTS) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', attempt: delivery.attempt, error: 'Delivery abandoned after repeated worker failures', claimedAt: null },
        });
        trackFailure({ event: "webhook.delivery.abandoned", error: 'Attempts exhausted by stale claims', metricName: "webhook_delivery_abandoned" });
        continue;
      }

      const subscription = await getSubscription(delivery.subscriptionId);
      if (!subscription?.active) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'cancelled', error: 'Subscription is no longer active', claimedAt: null },
        });
        continue;
      }

      const startedAt = Date.now();
      const result = await deliverWebhook(subscription, delivery.payload as unknown as WebhookPayload);
      const durationMs = Date.now() - startedAt;
      const attempt = delivery.attempt + 1;
      const shouldRetry = !result.success && result.retryable && attempt < DELIVERY_ATTEMPTS;

      if (shouldRetry) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'pending',
            attempt,
            nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]),
            claimedAt: null,
            responseStatus: result.status,
            responseBody: result.responseBody?.slice(0, 1000),
            error: result.error,
            durationMs,
          },
        });
        trackFailure({ event: "webhook.delivery.retry_scheduled", error: result.error ?? 'transient response', metricName: "webhook_delivery_retry_scheduled" });
        continue;
      }

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.success ? 'complete' : 'failed',
          attempt,
          claimedAt: null,
          responseStatus: result.status,
          responseBody: result.responseBody?.slice(0, 1000),
          error: result.error,
          durationMs,
          deliveredAt: new Date(),
        },
      });
      await updateSubscriptionFailure(subscription.id, result.status ?? null, result.success);

      if (!result.success && subscription.failureCount + 1 >= FAILURE_THRESHOLD) {
        await prisma.webhookSubscription.update({ where: { id: subscription.id }, data: { active: false } });
        trackFailure({ event: "webhook.subscription.auto_disabled", error: `${subscription.failureCount + 1} consecutive failures`, metricName: "webhook_subscription_auto_disabled" });
      }

      if (result.success) {
        trackSuccess({ event: "webhook.delivery.succeeded", metricName: "webhook_delivery_succeeded", data: { status: result.status, durationMs } });
      } else {
        trackFailure({ event: "webhook.delivery.failed", error: result.error ?? "unknown", metricName: "webhook_delivery_failed" });
      }
    } catch (error) {
      // Leave the claim in place; another tick safely reclaims it after the lease expires.
      trackFailure({ event: "webhook.delivery.worker.failed", error, metricName: "webhook_delivery_worker_failed" });
    }
  }

  return processed;
}

export function ensureWebhookDeliveryWorkerStarted(): void {
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build') return;
  if (global.__webhook_delivery_worker_started__) return;

  global.__webhook_delivery_worker_started__ = true;
  const timer = setInterval(() => {
    void processWebhookDeliveries().catch((error) => {
      trackFailure({ event: "webhook.delivery.queue.poll_failed", error, metricName: "webhook_delivery_queue_poll_failed" });
    });
  }, QUEUE_POLL_INTERVAL_MS);
  timer.unref?.();
  void processWebhookDeliveries().catch((error) => {
    trackFailure({ event: "webhook.delivery.queue.poll_failed", error, metricName: "webhook_delivery_queue_poll_failed" });
  });
}

// ─── Schema Migration ──────────────────────────────────────────────────

export async function ensureWebhookSchema(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "WebhookSubscription" (
      "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      "name" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "secret" TEXT NOT NULL DEFAULT '',
      "events" TEXT NOT NULL DEFAULT '[]',
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdBy" TEXT NOT NULL,
      "lastTriggeredAt" DATETIME,
      "lastStatus" INTEGER,
      "failureCount" INTEGER NOT NULL DEFAULT 0
    )
  `;
}
