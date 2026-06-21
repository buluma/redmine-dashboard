import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { trackFailure } from "@/src/lib/telemetry";

const updateLocalIssueSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  tracker: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  priorityId: z.number().optional().nullable(),
  statusId: z.number().optional(),
  statusName: z.string().optional(),
  assignedToId: z.number().optional().nullable(),
  assignedToName: z.string().optional().nullable(),
  categoryId: z.number().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  doneRatio: z.number().min(0).max(100).optional().nullable(),
  parentIssueId: z.number().optional().nullable(),
  parentIssueLabel: z.string().optional().nullable(),
  customFieldsJson: z.unknown().optional().nullable(),
  allowedStatusesJson: z.unknown().optional().nullable(),
  childrenJson: z.unknown().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    // Guard: verify issue is local
    const existing = await prisma.issue.findUnique({
      where: { id },
      select: { id: true, source: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Local issue not found" }, { status: 404 });
    }

    if (existing.source !== "local") {
      return NextResponse.json(
        { error: "Cannot update Redmine-synced issue via local API" },
        { status: 403 }
      );
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateLocalIssueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const before = await prisma.issue.findUnique({ where: { id }, select: { statusName: true, statusId: true, priority: true, assignedToName: true, doneRatio: true } });

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : data.startDate === null ? null : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : data.dueDate === null ? null : undefined,
        customFieldsJson: data.customFieldsJson !== undefined ? (data.customFieldsJson as Prisma.InputJsonValue) : undefined,
        allowedStatusesJson: data.allowedStatusesJson !== undefined ? (data.allowedStatusesJson as Prisma.InputJsonValue) : undefined,
        childrenJson: data.childrenJson !== undefined ? (data.childrenJson as Prisma.InputJsonValue) : undefined,
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_update",
      },
    });

    const details: Array<{ property: string; name: string; old_value: string; new_value: string }> = [];
    if (before && data.statusName && data.statusName !== before.statusName) {
      details.push({ property: "attr", name: "status", old_value: before.statusName, new_value: data.statusName });
    }
    if (before && data.priority && data.priority !== before.priority) {
      details.push({ property: "attr", name: "priority", old_value: before.priority ?? "", new_value: data.priority });
    }
    if (before && data.assignedToName !== undefined && data.assignedToName !== before.assignedToName) {
      details.push({ property: "attr", name: "assigned_to", old_value: before.assignedToName ?? "", new_value: data.assignedToName ?? "" });
    }
    if (before && data.doneRatio !== undefined && data.doneRatio !== before.doneRatio) {
      details.push({ property: "attr", name: "done_ratio", old_value: String(before.doneRatio ?? 0), new_value: String(data.doneRatio ?? 0) });
    }

    if (details.length > 0) {
      const maxJournal = await prisma.issueJournal.aggregate({
        where: { issueId: id },
        _max: { redmineJournalId: true },
      });
      const nextJournalId = (maxJournal._max.redmineJournalId ?? 0) + 1;
      await prisma.issueJournal.create({
        data: {
          issueId: id,
          redmineJournalId: nextJournalId,
          author: user.displayName ?? user.emailOrUsername ?? "You",
          notes: null,
          detailsJson: details as unknown as Prisma.InputJsonValue,
          createdOnRemote: new Date(),
        },
      });
    }

    return NextResponse.json({ issue });
  } catch (error) {
    trackFailure({ event: "issues.local.update.failed", error, metricName: "issues_local_update_failed" });
    return NextResponse.json(
      { error: "Failed to update local issue", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    // Guard: verify issue is local
    const existing = await prisma.issue.findUnique({
      where: { id },
      select: { id: true, source: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Local issue not found" }, { status: 404 });
    }

    if (existing.source !== "local") {
      return NextResponse.json(
        { error: "Cannot delete Redmine-synced issue via local API" },
        { status: 403 }
      );
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cascade delete handled by Prisma @relation onDelete: Cascade
    await prisma.issue.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    trackFailure({ event: "issues.local.delete.failed", error, metricName: "issues_local_delete_failed" });
    return NextResponse.json(
      { error: "Failed to delete local issue", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
