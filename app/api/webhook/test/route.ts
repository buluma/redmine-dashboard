import { NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import { isWebhookEnabled, sendTicketWebhook } from "@/src/lib/outgoing-webhook";

export const runtime = "nodejs";

export async function POST() {
  try {
    // Require admin or editor role
    await requireRole("ADMIN", "EDITOR");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWebhookEnabled()) {
    return NextResponse.json({ error: "Webhook not enabled or no URLs configured" }, { status: 400 });
  }

  // Send a test webhook
  await sendTicketWebhook("ticket.created", {
    id: "test-ticket-001",
    redmineIssueId: 12345,
    subject: "Test Ticket - Webhook Verification",
    description: "This is a test webhook payload to verify your webhook configuration.",
    projectName: "Test Project",
    statusName: "New",
    priorityName: "Normal",
    assignedToName: "Test User",
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, message: "Test webhook sent" });
}