import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET() {
  try {
    const { user } = await requireRedmineClient();
    const users = await prisma.issue.findMany({
      where: {
        userId: user.id,
        assignedToName: { not: null },
      },
      distinct: ["assignedToName"],
      select: { assignedToName: true },
    });

    return Response.json({
      users: users
        .filter(u => u.assignedToName)
        .map(u => ({ id: 0, name: u.assignedToName! }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch users";
    return Response.json({ error: message }, { status: 500 });
  }
}
