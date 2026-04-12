import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET() {
  try {
    await requireRedmineClient();
    const activities = await prisma.enumerationCatalog.findMany({
      where: { kind: "time_entry_activity", isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    return Response.json({
      activities: activities.map(a => ({
        id: a.remoteId,
        name: a.name,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch activities";
    return Response.json({ error: message }, { status: 500 });
  }
}
