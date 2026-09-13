import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import {
  saveSavedViewSchema,
  savedViewLegacyFields,
  toDashboardSavedView,
} from "@/src/lib/saved-view-contract";

// GET /api/saved-views - List all saved views for current user
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const views = await prisma.savedView.findMany({
      where: { userId: user.id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        project: true,
        status: true,
        search: true,
        sortBy: true,
        sortOrder: true,
        statusIds: true,
        priorityIds: true,
        assignedToMe: true,
        dueInDays: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        position: true,
        filters: true,
      },
    });

    return Response.json({ views: views.map(toDashboardSavedView) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch saved views", 500);
  }
}

// POST /api/saved-views - Create a new saved view
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = saveSavedViewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonError("Invalid saved view", 400);
    }

    const position = await prisma.savedView.count({
      where: { userId: user.id },
    });
    const view = await prisma.savedView.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        filters: parsed.data.filters,
        ...savedViewLegacyFields(parsed.data.filters),
        statusIds: [],
        priorityIds: [],
        position,
      },
    });

    return Response.json({ view: toDashboardSavedView(view) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to create saved view", 500);
  }
}
