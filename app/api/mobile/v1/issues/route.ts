import { Prisma } from "@prisma/client";
import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { issueQuerySchema } from "@/src/lib/schemas";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { searchParams } = new URL(request.url);
    const parsed = issueQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return jsonError("Invalid query", 400);
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

    const [total, items] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          journals: {
            orderBy: { createdOnRemote: "desc" },
            take: 10,
          },
          timeEntries: {
            orderBy: { spentOn: "desc" },
            take: 10,
          },
          githubLinks: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      }),
    ]);

    return Response.json({
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch mobile issues";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
