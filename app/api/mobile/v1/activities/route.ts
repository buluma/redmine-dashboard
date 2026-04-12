import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    await requireMobileUser(request);
    const activities = await prisma.enumerationCatalog.findMany({
      where: { kind: "time_entry_activity", isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });

    return Response.json({
      activities: activities.map((a) => ({
        id: a.remoteId,
        name: a.name,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch activities";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
