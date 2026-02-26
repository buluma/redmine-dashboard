import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET() {
  try {
    const cached = await prisma.enumerationCatalog.findMany({
      where: { kind: "time_entry_activity", isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { remoteId: true, name: true },
    });

    if (cached.length > 0) {
      return Response.json({
        activities: cached.map((entry) => ({ id: entry.remoteId, name: entry.name })),
      });
    }

    const { client } = await requireRedmineClient();
    const activities = await client.getTimeEntryActivities();
    return Response.json({ activities });
  } catch {
    return Response.json({ activities: [] });
  }
}
