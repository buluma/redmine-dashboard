import { Prisma } from "@prisma/client";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { issueQuerySchema } from "@/src/lib/schemas";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const parsed = issueQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }

    const q = parsed.data;

    const where: Prisma.IssueWhereInput = {
      userId: user.id,
      ...(q.status ? { statusName: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.search
        ? {
            OR: [
              { subject: { contains: q.search } },
              { description: { contains: q.search } },
              { assignedToName: { contains: q.search } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.IssueOrderByWithRelationInput[] =
      q.sort === "updated_asc"
        ? [{ updatedOnRemote: "asc" }]
        : q.sort === "priority"
          ? [{ priority: "asc" }, { updatedOnRemote: "desc" }]
          : q.sort === "due_date"
            ? [{ dueDate: "asc" }, { updatedOnRemote: "desc" }]
            : [{ updatedOnRemote: "desc" }];

    const [total, issues, statusCatalog, priorities] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          journals: {
            orderBy: { createdOnRemote: "desc" },
            take: 20,
          },
          timeEntries: {
            orderBy: { spentOn: "desc" },
            take: 20,
          },
        },
      }),
      prisma.statusCatalog.findMany({ orderBy: { name: "asc" } }),
      prisma.issue.findMany({
        where: { userId: user.id },
        distinct: ["priority"],
        select: { priority: true },
      }),
    ]);

    return Response.json({
      items: issues,
      total,
      page: q.page,
      pageSize: q.pageSize,
      filters: {
        statuses: statusCatalog,
        priorities: priorities.map((p) => p.priority).filter((v): v is string => Boolean(v)),
      },
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
