import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { buildMobileSearchWhere } from "@/src/lib/mobile-search";

const MAX_LIMIT = 50;

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)), MAX_LIMIT);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    if (query.length < 2) {
      return Response.json({ results: [], total: 0, query });
    }

    const where = buildMobileSearchWhere(user.id, query);

    const [total, items] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy: [{ updatedOnRemote: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          redmineIssueId: true,
          localIssueNumber: true,
          subject: true,
          projectName: true,
          statusName: true,
          priority: true,
          dueDate: true,
          assignedToName: true,
          source: true,
        },
      }),
    ]);

    return Response.json({
      results: items.map((i) => ({
        id: i.id,
        redmineIssueId: i.redmineIssueId,
        localIssueNumber: i.localIssueNumber,
        subject: i.subject,
        projectName: i.projectName,
        statusName: i.statusName,
        priority: i.priority,
        dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
        assignedToName: i.assignedToName,
        source: i.source,
      })),
      total,
      query,
      page,
      pageSize: limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const status =
      message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
