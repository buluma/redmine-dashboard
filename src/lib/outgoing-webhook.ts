/**
 * Outgoing Webhook Service
 * 
 * Sends ticket events to configured external webhook URLs.
 * Supports multiple endpoints with custom payloads.
 */

import https from 'https';

export interface OutgoingWebhookConfig {
  enabled: boolean;
  urls: string[];           // Array of webhook URLs to send to
  secret: string;           // Optional secret for HMAC signature
  include: {
    onCreate: boolean;
    onUpdate: boolean;
    onStatusChange: boolean;
    onAssignment: boolean;
  };
}

export interface TicketWebhookPayload {
  event: "ticket.created" | "ticket.updated" | "ticket.status_changed" | "ticket.assigned";
  timestamp: string;
  ticket: {
    id: string;
    redmineIssueId: number | null;
    subject: string;
    description: string | null;
    projectName: string | null;
    statusName: string;
    priorityName: string | null;
    assignedToName: string | null;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
  };
  changes?: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }[];
  metadata?: {
    userId: string;
    userName: string;
  };
}

const DEFAULT_WEBHOOK_CONFIG: OutgoingWebhookConfig = {
  enabled: false,
  urls: [],
  secret: "",
  include: {
    onCreate: true,
    onUpdate: true,
    onStatusChange: true,
    onAssignment: true,
  },
};

function getWebhookConfig(): OutgoingWebhookConfig {
  const urls = (process.env.TICKET_WEBHOOK_URLS || "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"));

  if (urls.length === 0) {
    return { ...DEFAULT_WEBHOOK_CONFIG, enabled: false };
  }

  return {
    enabled: process.env.TICKET_WEBHOOK_ENABLED === "true",
    urls,
    secret: process.env.TICKET_WEBHOOK_SECRET || "",
    include: {
      onCreate: process.env.TICKET_WEBHOOK_ON_CREATE !== "false",
      onUpdate: process.env.TICKET_WEBHOOK_ON_UPDATE !== "false",
      onStatusChange: process.env.TICKET_WEBHOOK_ON_STATUS_CHANGE !== "false",
      onAssignment: process.env.TICKET_WEBHOOK_ON_ASSIGNMENT !== "false",
    },
  };
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  if (!secret) return "";
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Send webhook to a single URL
 */
function sendToUrl(url: string, payload: TicketWebhookPayload, secret: string): Promise<boolean> {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const signature = generateSignature(body, secret);

    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-Webhook-Event": payload.event,
        "X-Webhook-Timestamp": payload.timestamp,
      },
      family: 4,  // Force IPv4
    };

    if (signature) {
      options.headers["X-Webhook-Signature"] = `sha256=${signature}`;
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        console.log("[Webhook] Response from", parsed.hostname, ":", res.statusCode);
        resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
      });
    });

    req.on("error", (e) => {
      console.error("[Webhook] Error sending to", parsed.hostname, ":", e.message);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Send ticket webhook to all configured URLs
 */
export async function sendTicketWebhook(
  event: TicketWebhookPayload["event"],
  ticket: TicketWebhookPayload["ticket"],
  changes?: TicketWebhookPayload["changes"],
  userId?: string,
  userName?: string
): Promise<void> {
  const config = getWebhookConfig();
  if (!config.enabled || config.urls.length === 0) {
    return;
  }

  // Check if this event type should be sent
  const shouldSend =
    (event === "ticket.created" && config.include.onCreate) ||
    (event === "ticket.updated" && config.include.onUpdate) ||
    (event === "ticket.status_changed" && config.include.onStatusChange) ||
    (event === "ticket.assigned" && config.include.onAssignment);

  if (!shouldSend) {
    return;
  }

  const payload: TicketWebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    ticket,
    changes,
    metadata: userId ? { userId, userName: userName || "unknown" } : undefined,
  };

  console.log("[Webhook] Sending ticket webhook:", event, "to", config.urls.length, "endpoints");

  // Send to all URLs in parallel
  await Promise.all(
    config.urls.map((url) => sendToUrl(url, payload, config.secret))
  );
}

/**
 * Check if webhook is configured and enabled
 */
export function isWebhookEnabled(): boolean {
  const config = getWebhookConfig();
  return config.enabled && config.urls.length > 0;
}

/**
 * Get webhook configuration (without secrets)
 */
export function getWebhookStatus(): { enabled: boolean; urls: string[]; events: string[] } {
  const config = getWebhookConfig();
  const events: string[] = [];
  if (config.include.onCreate) events.push("ticket.created");
  if (config.include.onUpdate) events.push("ticket.updated");
  if (config.include.onStatusChange) events.push("ticket.status_changed");
  if (config.include.onAssignment) events.push("ticket.assigned");

  return {
    enabled: config.enabled,
    urls: config.urls.map((u) => {
      // Mask passwords in URL
      const parsed = new URL(u);
      if (parsed.password) {
        parsed.password = "***";
      }
      return parsed.toString();
    }),
    events,
  };
}