import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/rbac";
import { getAuthenticatedUserId, requireRedmineClientForUser } from "@/src/lib/auth";
import { listSeries, createSeries } from "@/src/lib/recurring-ticket-series";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

const seriesInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "key must be lowercase letters, numbers, and hyphens only"),
  name: z.string().min(1).max(200),
  isActive: z.boolean().optional(),
  // Optional: derived from parentIssueId's own project via a Redmine lookup
  // when omitted (see POST below) — Redmine's create-issue API still needs
  // a concrete project_id, it just doesn't have to come from the form.
  redmineProjectId: z.number().int().positive().optional(),
  parentIssueId: z.number().int().positive(),
  trackerId: z.number().int().positive(),
  priorityId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  subjectTemplate: z.string().min(1).max(500),
  descriptionTemplate: z.string().max(5000).nullable().optional(),
  estimatedHours: z.number().positive().nullable().optional(),
  customFieldsJson: z.array(z.object({ id: z.number().int(), value: z.string() })).nullable().optional(),
  cadence: z.enum(["weekly", "monthly"]),
  createWeekday: z.number().int().min(1).max(7),
  closeWeekday: z.number().int().min(1).max(7),
  createDayOfMonth: z.number().int().min(1).max(31),
  closeDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  wakatimeProjectName: z.string().min(1).max(200),
  defaultActivityId: z.number().int().positive(),
  defaultActivityName: z.string().min(1).max(100),
  expectsTime: z.boolean(),
});

// GET /api/recurring-tickets - list the current user's recurring ticket series
export async function GET() {
  try {
    await requireRole("ADMIN");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const series = await listSeries(userId);
    return NextResponse.json({ items: series });
  } catch (error) {
    trackFailure({ event: "recurring_tickets.series.list.failed", error, metricName: "recurring_tickets_series_list_failed" });
    return NextResponse.json({ error: "Failed to list recurring ticket series" }, { status: 500 });
  }
}

// POST /api/recurring-tickets - create a new recurring ticket series
export async function POST(request: NextRequest) {
  try {
    await requireRole("ADMIN");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = seriesInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    let redmineProjectId = parsed.data.redmineProjectId;
    if (redmineProjectId === undefined) {
      try {
        const { client } = await requireRedmineClientForUser(userId);
        const detail = await client.getIssue(parsed.data.parentIssueId);
        const project = detail.issue.project as { id?: number } | undefined;
        if (!project?.id) {
          return NextResponse.json(
            { error: "Could not determine project from Parent Issue ID — provide Redmine Project ID directly" },
            { status: 400 },
          );
        }
        redmineProjectId = project.id;
      } catch {
        return NextResponse.json(
          { error: "Failed to look up Parent Issue ID on Redmine — provide Redmine Project ID directly" },
          { status: 400 },
        );
      }
    }

    const series = await createSeries(userId, { ...parsed.data, redmineProjectId });
    return NextResponse.json({ series }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A series with this key already exists" }, { status: 409 });
    }
    trackFailure({ event: "recurring_tickets.series.create.failed", error, metricName: "recurring_tickets_series_create_failed" });
    return NextResponse.json({ error: "Failed to create recurring ticket series" }, { status: 500 });
  }
}
