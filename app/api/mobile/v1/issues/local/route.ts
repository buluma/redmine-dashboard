import { Prisma } from "@prisma/client";
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

function asDoneRatio(value: unknown): number | undefined {
  const n = asNumber(value);
  if (n == null) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statusIdFor(statusName: string | undefined, fallback: number | undefined): number {
  if (fallback && fallback > 0) return Math.round(fallback);
  switch (statusName?.toLowerCase()) {
    case "in progress":
      return 2;
    case "resolved":
      return 3;
    case "closed":
      return 5;
    default:
      return 1;
  }
}

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);

    const [total, issues] = await Promise.all([
      prisma.issue.count({ where: { userId: user.id, source: "local" } }),
      prisma.issue.findMany({
        where: { userId: user.id, source: "local" },
        orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
    ]);

    return Response.json({
      items: issues.map((issue) => ({ ...toIssueView(issue), isFavorited: false })),
      total,
      page: 1,
      pageSize: 100,
      source: "local",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list local issues";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function POST(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const body = (await request.json()) as LocalIssueBody;
    const subject = asText(body.subject);
    if (!subject) return jsonError("Subject is required", 400);

    const statusName = asText(body.statusName) ?? "New";
    const maxNumber = await prisma.issue.aggregate({
      where: { userId: user.id, source: "local" },
      _max: { localIssueNumber: true },
    });

    const issue = await prisma.issue.create({
      data: {
        userId: user.id,
        source: "local",
        localIssueNumber: (maxNumber._max.localIssueNumber ?? 0) + 1,
        redmineIssueId: null,
        redmineBaseUrl: null,
        subject,
        description: asNullableText(body.description),
        tracker: asText(body.tracker) ?? "Task",
        priority: asText(body.priority) ?? "Normal",
        statusId: statusIdFor(statusName, asNumber(body.statusId)),
        statusName,
        dueDate: asDate(body.dueDate),
        estimatedHours: asNumber(body.estimatedHours),
        doneRatio: asDoneRatio(body.doneRatio) ?? 0,
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_create",
        allowedStatusesJson: [
          { id: 1, name: "New", isClosed: false },
          { id: 2, name: "In Progress", isClosed: false },
          { id: 3, name: "Resolved", isClosed: true },
          { id: 5, name: "Closed", isClosed: true },
        ] as Prisma.InputJsonValue,
      },
    });

    return Response.json({ issue: { ...toIssueView(issue), isFavorited: false } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create local issue";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
