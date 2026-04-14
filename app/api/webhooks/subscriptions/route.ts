import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import {
  createSubscription,
  listSubscriptions,
  WebhookEvent,
} from "@/src/lib/webhook-subscription";

export const runtime = "nodejs";

// GET /api/webhooks/subscriptions - List all subscriptions
export async function GET() {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subscriptions = await listSubscriptions();
    // Mask secrets in response
    return NextResponse.json(
      subscriptions.map((sub) => ({
        ...sub,
        secret: sub.secret ? "***" : "",
      }))
    );
  } catch (err) {
    console.error("Error listing webhook subscriptions:", err);
    return NextResponse.json(
      { error: "Failed to list subscriptions" },
      { status: 500 }
    );
  }
}

// POST /api/webhooks/subscriptions - Create a new subscription
export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, url, secret = "", events } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Validate events
    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "At least one event type is required" },
        { status: 400 }
      );
    }

    const validEvents: WebhookEvent[] = [
      "ticket.created",
      "ticket.updated",
      "ticket.status_changed",
      "ticket.assigned",
      "ticket.deleted",
      "ticket.completed",
    ];

    const invalidEvents = events.filter(
      (e: string) => !validEvents.includes(e as WebhookEvent)
    );
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid event types: ${invalidEvents.join(", ")}` },
        { status: 400 }
      );
    }

    // Get user ID from session for audit logging
    const { getSessionUserId } = await import("@/src/lib/session");
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscription = await createSubscription(
      name.trim(),
      url,
      secret,
      events as WebhookEvent[],
      userId
    );

    return NextResponse.json(
      {
        ...subscription,
        secret: subscription.secret ? "***" : "",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Error creating webhook subscription:", err);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}