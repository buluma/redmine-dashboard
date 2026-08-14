import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { z } from "zod";
import { trackFailure } from "@/src/lib/telemetry";

const logTimeSchema = z.object({
  hours: z.number().positive(),
  comments: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const existing = await prisma.issue.findUnique({
      where: { id },
      select: { id: true, source: true, userId: true },
    });

    if (!existing || existing.source !== "local") {
      return NextResponse.json({ error: "Local issue not found" }, { status: 404 });
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = logTimeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await prisma.timeEntry.create({
      data: {
        issueId: id,
        userId: user.id,
        hours: parsed.data.hours,
        spentOn: new Date(),
        activityId: 31,
        activityName: "Development",
        comments: parsed.data.comments ?? null,
      },
    });

    await prisma.issue.update({
      where: { id },
      data: { lastActivityAt: new Date(), lastActivityType: "time_logged" },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    trackFailure({ event: "issues.local.time.failed", error, metricName: "issues_local_time_failed" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to log time" },
      { status: 500 }
    );
  }
}
