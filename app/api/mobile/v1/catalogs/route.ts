import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);

    const { client } = await requireRedmineClientForUser(user.id);

    const [statuses, priorities, trackerRows, projects] = await Promise.all([
      prisma.statusCatalog.findMany({ orderBy: { id: "asc" } }),
      prisma.enumerationCatalog.findMany({
        where: { kind: "issue_priority", isActive: true },
        orderBy: { position: "asc" },
      }),
      prisma.issue.findMany({
        where: { userId: user.id, tracker: { not: null } },
        select: { tracker: true },
        distinct: ["tracker"],
        orderBy: { tracker: "asc" },
      }),
      client.listProjects(),
    ]);

    return Response.json({
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        isClosed: s.isClosed,
      })),
      priorities: priorities.map((p) => ({
        id: p.remoteId,
        name: p.name,
        isDefault: p.isDefault,
      })),
      trackers: trackerRows
        .map((r) => r.tracker)
        .filter((t): t is string => t !== null),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        identifier: p.identifier,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch catalogs";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : 400;
    return jsonError(message, status);
  }
}
