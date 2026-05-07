import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const createLocalIssueSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().optional(),
  tracker: z.string().optional(),
  priority: z.string().optional(),
  priorityId: z.number().optional(),
  statusId: z.number().default(1),
  statusName: z.string().default("New"),
  assignedToId: z.number().optional(),
  assignedToName: z.string().optional(),
  authorId: z.number().optional(),
  authorName: z.string().optional(),
  categoryId: z.number().optional(),
  categoryName: z.string().optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedHours: z.number().optional(),
  doneRatio: z.number().min(0).max(100).optional(),
  parentIssueId: z.number().optional(),
  parentIssueLabel: z.string().optional(),
  customFieldsJson: z.unknown().optional(),
  allowedStatusesJson: z.unknown().optional(),
  childrenJson: z.unknown().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const body = await request.json();
    const parsed = createLocalIssueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Auto-generate localIssueNumber (max + 1 for this user)
    const maxNumber = await prisma.issue.aggregate({
      where: { userId: user.id, source: "local" },
      _max: { localIssueNumber: true },
    });
    const localIssueNumber = (maxNumber._max.localIssueNumber ?? 0) + 1;

    const issue = await prisma.issue.create({
      data: {
        userId: user.id,
        source: "local",
        localIssueNumber,
        redmineIssueId: null,
        redmineBaseUrl: null,
        subject: data.subject,
        description: data.description,
        tracker: data.tracker,
        priority: data.priority,
        priorityId: data.priorityId,
        statusId: data.statusId,
        statusName: data.statusName,
        assignedToId: data.assignedToId,
        assignedToName: data.assignedToName,
        authorId: data.authorId,
        authorName: data.authorName,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        estimatedHours: data.estimatedHours,
        doneRatio: data.doneRatio,
        parentIssueId: data.parentIssueId,
        parentIssueLabel: data.parentIssueLabel,
        customFieldsJson: data.customFieldsJson !== undefined ? (data.customFieldsJson as Prisma.InputJsonValue) : undefined,
        allowedStatusesJson: data.allowedStatusesJson !== undefined ? (data.allowedStatusesJson as Prisma.InputJsonValue) : undefined,
        childrenJson: data.childrenJson !== undefined ? (data.childrenJson as Prisma.InputJsonValue) : undefined,
        updatedOnRemote: new Date(),
        lastActivityAt: new Date(),
        lastActivityType: "local_create",
      },
    });

    return NextResponse.json({ issue }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to create local issue:", error);
    return NextResponse.json(
      { error: "Failed to create local issue", message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);

    const statusFilter = searchParams.get("status");
    const trackerFilter = searchParams.get("tracker");
    const priorityFilter = searchParams.get("priority");
    const assignedToMeFilter = searchParams.get("assignedToMe");

    const where: Prisma.IssueWhereInput = {
      userId: user.id,
      source: "local",
    };

    if (statusFilter) {
      where.statusName = statusFilter;
    }
    if (trackerFilter) {
      where.tracker = trackerFilter;
    }
    if (priorityFilter) {
      where.priority = priorityFilter;
    }
    if (assignedToMeFilter === "true") {
      where.assignedToId = user.id;
    }

    const issues = await prisma.issue.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        localIssueNumber: true,
        subject: true,
        statusName: true,
        statusId: true,
        tracker: true,
        priority: true,
        priorityId: true,
        assignedToName: true,
        dueDate: true,
        doneRatio: true,
        estimatedHours: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ issues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to list local issues:", error);
    return NextResponse.json(
      { error: "Failed to list local issues", message },
      { status: 500 }
    );
  }
}
