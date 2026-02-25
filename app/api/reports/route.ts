import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const issues = await prisma.issue.findMany({
      where: { userId: user.id },
      orderBy: { updatedOnRemote: "desc" },
      include: {
        journals: {
          orderBy: { createdOnRemote: "desc" },
        },
        timeEntries: {
          orderBy: { spentOn: "desc" },
        },
      },
      take: 2000,
    });

    return Response.json({
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      items: issues,
      total: issues.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch report data";
    const status = message === "Unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
