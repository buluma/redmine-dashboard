import { NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import { dispatchWebhook } from "@/src/lib/webhook-subscription";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

// POST /api/webhooks/test - Send test webhook to all subscribers
export async function POST() {
  try {
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const testTicket = {
      id: "test-ticket-local",
      redmineIssueId: 99999,
      subject: "Test Ticket - Webhook Verification",
      description: "This is a test webhook payload to verify your webhook configuration.",
      projectName: "Test Project",
      trackerName: "Bug",
      statusName: "New",
      priorityName: "Normal",
      assignedToId: null,
      assignedToName: null,
      authorId: null,
      authorName: "System",
      dueDate: null,
      doneRatio: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Dispatch to all subscribers (they'll filter by event)
    await dispatchWebhook("ticket.created", testTicket);

    return NextResponse.json({
      success: true,
      message: "Test webhook dispatched to all active subscribers",
    });
  } catch (err) {
    trackFailure({ event: "webhooks.test.failed", error: err, metricName: "webhooks_test_failed" });
    return NextResponse.json(
      { error: "Failed to send test webhook" },
      { status: 500 }
    );
  }
}