import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

function displayName(user: { firstname?: string; lastname?: string; login?: string; name?: string }): string {
  return [user.firstname, user.lastname].filter(Boolean).join(" ").trim()
    || user.name
    || user.login
    || "Unnamed user";
}

async function cachedAssignees(userId: string): Promise<Array<{ id: number; name: string }>> {
  const issues = await prisma.issue.findMany({
    where: {
      userId,
      assignedToId: { not: null },
      assignedToName: { not: null },
    },
    distinct: ["assignedToId"],
    orderBy: { assignedToName: "asc" },
    select: { assignedToId: true, assignedToName: true },
  });

  return issues
    .flatMap((issue) => (
      issue.assignedToId && issue.assignedToName
        ? [{ id: issue.assignedToId, name: issue.assignedToName }]
        : []
    ))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

    try {
      const users = await client.listUsers();
      return Response.json({
        users: users
          .map((u) => ({ id: u.id, name: displayName(u) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        source: "redmine_api",
      });
    } catch {
      const localUsers = await prisma.redmineUser.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });

      if (localUsers.length > 0) {
        return Response.json({
          users: localUsers,
          source: "local_cache",
        });
      }

      return Response.json({
        users: await cachedAssignees(user.id),
        source: "issue_cache",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch users";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
