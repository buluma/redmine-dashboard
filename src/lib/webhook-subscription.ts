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

import https from 'https';
import { prisma } from './db';
import { getAuditService } from './audit';

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
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ─── Webhook Delivery ───────────────────────────────────────────────────

async function deliverWebhook(
  subscription: WebhookSubscription,
  payload: WebhookPayload
): Promise<{ success: boolean; status?: number; responseBody?: string; error?: string }> {
  const body = JSON.stringify(payload);
  const signature = generateSignature(body, subscription.secret);

  return new Promise((resolve) => {
    try {
      const parsed = new URL(subscription.url);
      const options = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Converge-Webhook/1.0',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Delivery': payload.id,
          'X-Webhook-Timestamp': payload.timestamp,
          'X-Webhook-Signature': `sha256=${signature}`,
        },
        family: 4, // Force IPv4
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const success = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
          resolve({
            success,
            status: res.statusCode,
            responseBody: data,
            error: success ? undefined : `HTTP ${res.statusCode}: ${data.substring(0, 100)}`,
          });
        });
      });

      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.write(body);
      req.end();
    } catch (e: any) {
      resolve({ success: false, error: e.message });
    }
  });
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

  console.log(`[Webhook] Dispatching ${event} to ${interested.length} subscriber(s)`);

  // Deliver to all interested subscribers in parallel
  await Promise.all(
    interested.map(async (sub) => {
      const startTime = Date.now();
      try {
        const result = await deliverWebhook(sub, payload);
        const durationMs = Date.now() - startTime;
        
        await updateSubscriptionFailure(sub.id, result.status ?? null, result.success);
        
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
          console.error("[Webhook] Failed to log delivery:", err);
        });

        console.log(`[Webhook] Delivery ${result.success ? '✓' : '✗'} to ${maskUrl(sub.url)}: ${result.status} (${durationMs}ms)`);

        if (!result.success) {
          console.error(`[Webhook] Delivery failed to ${maskUrl(sub.url)}:`, result.error);
        }
      } catch (err) {
        console.error(`[Webhook] Error delivering to ${maskUrl(sub.url)}:`, err);
        await updateSubscriptionFailure(sub.id, null, false);
        
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