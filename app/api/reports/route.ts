import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";

export async function GET(request: Request) {
  try {
    const { user, client } = await requireRedmineClient();
    const { searchParams } = new URL(request.url);
    const remoteMode = searchParams.get("timeEntries") === "remote";
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;

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

    let remoteTimeEntries: Array<Record<string, unknown>> = [];
    if (remoteMode) {
      remoteTimeEntries = await client.listTimeEntries({
        userId: "me",
        from,
        to,
        limit: 500,
      });
    }

    return Response.json({
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
      items: issues,
      total: issues.length,
      remoteTimeEntries,
      timeEntriesSource: remoteMode ? "redmine_live" : "local_cache",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch report data";
    const status = message === "Unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
