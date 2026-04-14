import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import {
  deleteSubscription,
  toggleSubscription,
} from "@/src/lib/webhook-subscription";

export const runtime = "nodejs";

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

// PATCH /api/webhooks/subscriptions/[id] - Toggle active status
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
    const { active } = body;

    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "active must be a boolean" },
        { status: 400 }
      );
    }

    await toggleSubscription(id, active);
    return NextResponse.json({ success: true, active });
  } catch (err) {
    console.error("Error toggling webhook subscription:", err);
    return NextResponse.json(
      { error: "Failed to update subscription" },
      { status: 500 }
    );
  }
}