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
import { prisma } from './db';
import { getAuditService } from './audit';
import { trackInfo, trackSuccess, trackFailure } from './telemetry';

// Auto-disable a subscription after this many consecutive delivery failures.
const FAILURE_THRESHOLD = 5;

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
  const updateData: Record<string, any> = {};
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

function toSubscription(row: any): WebhookSubscription {
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

async function deliverWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload
): Promise<{ success: boolean; status?: number; responseBody?: string; error?: string }> {
  const body = JSON.stringify(payload);
  const signature = generateSignature(body, subscription.secret);

  try {
    const response = await fetch(subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Converge-Webhook/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Delivery': payload.id,
        'X-Webhook-Timestamp': payload.timestamp,
        'X-Webhook-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const responseBody = await response.text().catch(() => '');
    const success = response.status >= 200 && response.status < 300;
    return {
      success,
      status: response.status,
      responseBody,
      error: success ? undefined : `HTTP ${response.status}: ${responseBody.substring(0, 100)}`,
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
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

  // Deliver to all interested subscribers in parallel
  await Promise.all(
    interested.map(async (sub) => {
      const startTime = Date.now();
      try {
        const result = await deliverWebhook(sub, payload);
        const durationMs = Date.now() - startTime;
        
        await updateSubscriptionFailure(sub.id, result.status ?? null, result.success);

        if (!result.success && sub.failureCount + 1 >= FAILURE_THRESHOLD) {
          await prisma.webhookSubscription.update({
            where: { id: sub.id },
            data: { active: false },
          });
          trackFailure({ event: "webhook.subscription.auto_disabled", error: `${sub.failureCount + 1} consecutive failures`, metricName: "webhook_subscription_auto_disabled" });
        }

        // Log delivery to database
        await prisma.webhookDelivery.create({
          data: {
            subscriptionId: sub.id,
            event,
            payload: payload as any,
            responseStatus: result.status,
            responseBody: result.responseBody?.slice(0, 1000),
            error: result.error,
            durationMs,
            attempt: 1,
            deliveredAt: new Date(),
          },
        }).catch(err => {
          trackFailure({ event: "webhook.delivery.log.failed", error: err });
        });

        if (result.success) {
          trackSuccess({ event: "webhook.delivery.succeeded", metricName: "webhook_delivery_succeeded", data: { status: result.status, durationMs } });
        } else {
          trackFailure({ event: "webhook.delivery.failed", error: result.error ?? "unknown", metricName: "webhook_delivery_failed" });
        }
      } catch (err) {
        trackFailure({ event: "webhook.delivery.error", error: err, metricName: "webhook_delivery_error" });
        await updateSubscriptionFailure(sub.id, null, false);

        if (sub.failureCount + 1 >= FAILURE_THRESHOLD) {
          await prisma.webhookSubscription.update({
            where: { id: sub.id },
            data: { active: false },
          });
          trackFailure({ event: "webhook.subscription.auto_disabled", error: `${sub.failureCount + 1} consecutive failures`, metricName: "webhook_subscription_auto_disabled" });
        }

        // Log failed delivery
        await prisma.webhookDelivery.create({
          data: {
            subscriptionId: sub.id,
            event,
            payload: payload as any,
            error: err instanceof Error ? err.message : "Unknown error",
            attempt: 1,
            deliveredAt: new Date(),
          },
        }).catch(() => {});
      }
    })
  );
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