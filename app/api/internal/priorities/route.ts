import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export async function GET() {
  try {
    await requireRedmineClient();

    // Try to fetch from Redmine API first
    try {
      const res = await fetch(
        `${process.env.REDMINE_BASE_URL}/enumerations/issue_priorities.json?key=${process.env.REDMINE_API_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        const priorities = data.issue_priorities || [];
        return Response.json({
          priorities: priorities.map((p: Record<string, unknown>) => ({
            id: p.id as number,
            name: p.name as string,
            isDefault: p.is_default as boolean,
            active: p.active as boolean,
          })),
          source: "redmine_api",
        });
      }
    } catch {
      // Fall through to local cache
    }

    // Fallback to local cache
    const priorities = await prisma.redmineEnumeration.findMany({
      where: { kind: "issue_priority", isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, name: true, isDefault: true, isActive: true },
    });

    return Response.json({
      priorities: priorities.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: p.isDefault,
        active: p.isActive,
      })),
      source: "local_cache",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ priorities: [], source: "error" });
  }
}
