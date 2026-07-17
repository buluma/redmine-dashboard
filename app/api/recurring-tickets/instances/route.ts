import { NextResponse } from "next/server";
import { requireRole } from "@/src/lib/rbac";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { listRecentInstances } from "@/src/lib/recurring-ticket-series";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

// GET /api/recurring-tickets/instances - recent create/close history across all series
export async function GET() {
  try {
    await requireRole("ADMIN");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const items = await listRecentInstances(userId);
    return NextResponse.json({ items });
  } catch (error) {
    trackFailure({ event: "recurring_tickets.instances.list.failed", error, metricName: "recurring_tickets_instances_list_failed" });
    return NextResponse.json({ error: "Failed to list recurring ticket instances" }, { status: 500 });
  }
}
