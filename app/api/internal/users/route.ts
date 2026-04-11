import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

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
    .flatMap((issue) => (issue.assignedToId && issue.assignedToName ? [{ id: issue.assignedToId, name: issue.assignedToName }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    const { client, user } = await requireRedmineClient();
    try {
      const users = await client.listUsers();

      return Response.json({
        users: users
          .map((user) => ({ id: user.id, name: displayName(user) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    } catch {
      return Response.json({ users: await cachedAssignees(user.id), source: "issue_cache" });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ users: [] });
  }
}
