import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { getRedmineCatalogScopeForUser } from "@/src/lib/redmine-scope";

export async function GET(request: Request) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const scope = await getRedmineCatalogScopeForUser(user.id);
    const activities = scope ? await prisma.enumerationCatalog.findMany({
      where: { scope, kind: "time_entry_activity", isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }) : [];

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
