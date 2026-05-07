import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { toIssueView } from "@/src/lib/issue-shape";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

type LocalIssueBody = {
  subject?: unknown;
  description?: unknown;
  tracker?: unknown;
  priority?: unknown;
  statusId?: unknown;
  statusName?: unknown;
  dueDate?: unknown;
  estimatedHours?: unknown;
  doneRatio?: unknown;
};

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function asDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const candidate = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asDoneRatio(value: unknown): number | null | undefined {
  if (value === null) return null;
  const n = asNumber(value);
  if (n == null) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statusIdFor(statusName: string | undefined, fallback: number | undefined): number | undefined {
  if (fallback && fallback > 0) return Math.round(fallback);
  switch (statusName?.toLowerCase()) {
    case "new":
      return 1;
    case "in progress":
      return 2;
    case "resolved":
      return 3;
    case "closed":
      return 5;
    default:
      return undefined;
  }
}

async function requireLocalIssue(userId: string, id: string) {
  const issue = await prisma.issue.findFirst({
    where: { id, userId, source: "local" },
    select: { id: true },
  });
  return issue;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const existing = await requireLocalIssue(user.id, id);
    if (!existing) return jsonError("Local issue not found", 404);

    const body = (await request.json()) as LocalIssueBody;
    const subject = asText(body.subject);
    if (body.subject !== undefined && !subject) return jsonError("Subject is required", 400);
    const statusName = asText(body.statusName);

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        subject,
        description: asNullableText(body.description),
        tracker: asNullableText(body.tracker),
        priority: asNullableText(body.priority),
        statusId: statusIdFor(statusName, asNumber(body.statusId)),
        statusName,
        dueDate: asDate(body.dueDate),
        estimatedHours: body.estimatedHours === null ? null : asNumber(body.estimatedHours),
        doneRatio: asDoneRatio(body.doneRatio),
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_update",
      },
    });

    return Response.json({ issue: { ...toIssueView(issue), isFavorited: false } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update local issue";
    const status =
      message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : message === "Local issue not found" ? 404 : 400;
    return jsonError(message, status);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const existing = await requireLocalIssue(user.id, id);
    if (!existing) return jsonError("Local issue not found", 404);

    await prisma.issue.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete local issue";
    const status =
      message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : message === "Local issue not found" ? 404 : 400;
    return jsonError(message, status);
  }
}
