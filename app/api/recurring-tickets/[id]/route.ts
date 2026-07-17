import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/rbac";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { getSeries, updateSeries, toggleSeries } from "@/src/lib/recurring-ticket-series";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

const seriesUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  redmineProjectId: z.number().int().positive().optional(),
  parentIssueId: z.number().int().positive().optional(),
  trackerId: z.number().int().positive().optional(),
  priorityId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  subjectTemplate: z.string().min(1).max(500).optional(),
  descriptionTemplate: z.string().max(5000).nullable().optional(),
  estimatedHours: z.number().positive().nullable().optional(),
  customFieldsJson: z.array(z.object({ id: z.number().int(), value: z.string() })).nullable().optional(),
  cadence: z.enum(["weekly", "monthly"]).optional(),
  createWeekday: z.number().int().min(1).max(7).optional(),
  closeWeekday: z.number().int().min(1).max(7).optional(),
  createDayOfMonth: z.number().int().min(1).max(31).optional(),
  closeDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  wakatimeProjectName: z.string().min(1).max(200).optional(),
  defaultActivityId: z.number().int().positive().optional(),
  defaultActivityName: z.string().min(1).max(100).optional(),
  expectsTime: z.boolean().optional(),
});

// PATCH /api/recurring-tickets/[id] - update fields, or toggle isActive alone
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const existing = await getSeries(id, userId);
    if (!existing) return NextResponse.json({ error: "Series not found" }, { status: 404 });

    const body = await request.json();

    // Toggle-only shortcut, mirroring webhooks/subscriptions/[id]'s PATCH.
    if (Object.keys(body).length === 1 && typeof body.isActive === "boolean") {
      await toggleSeries(id, userId, body.isActive);
      return NextResponse.json({ success: true, isActive: body.isActive });
    }

    const parsed = seriesUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const updated = await updateSeries(id, userId, parsed.data);
    return NextResponse.json({ series: updated });
  } catch (error) {
    trackFailure({ event: "recurring_tickets.series.update.failed", error, metricName: "recurring_tickets_series_update_failed" });
    return NextResponse.json({ error: "Failed to update recurring ticket series" }, { status: 500 });
  }
}
