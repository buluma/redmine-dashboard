import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import {
  deleteSubscription,
  toggleSubscription,
  updateSubscription,
  getSubscription,
} from "@/src/lib/webhook-subscription";

export const runtime = "nodejs";

// GET /api/webhooks/subscriptions/[id] - Get single subscription
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const subscription = await getSubscription(id);
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    return NextResponse.json({ ...subscription, secret: subscription.secret ? "***" : "" });
  } catch (err) {
    console.error("Error getting webhook subscription:", err);
    return NextResponse.json(
      { error: "Failed to get subscription" },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/subscriptions/[id] - Delete a subscription
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteSubscription(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting webhook subscription:", err);
    return NextResponse.json(
      { error: "Failed to delete subscription" },
      { status: 500 }
    );
  }
}

// PATCH /api/webhooks/subscriptions/[id] - Update or toggle subscription
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { active, name, url, secret, events } = body;

    // If only toggling active status
    if (Object.keys(body).length === 1 && typeof active === "boolean") {
      await toggleSubscription(id, active);
      return NextResponse.json({ success: true, active });
    }

    // Full update
    const validEvents = ["ticket.created", "ticket.updated", "ticket.status_changed", "ticket.assigned", "ticket.completed", "ticket.deleted"];
    
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (url !== undefined) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
      }
    }
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return NextResponse.json({ error: "At least one event is required" }, { status: 400 });
      }
      const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return NextResponse.json({ error: `Invalid events: ${invalidEvents.join(", ")}` }, { status: 400 });
      }
    }

    const updated = await updateSubscription(id, {
      name: name?.trim(),
      url,
      secret,
      events,
    });

    return NextResponse.json({ ...updated, secret: updated.secret ? "***" : "" });
  } catch (err) {
    console.error("Error updating webhook subscription:", err);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}