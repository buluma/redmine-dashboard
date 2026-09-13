import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import {
  MAX_SAVED_VIEWS,
  saveSavedViewSchema,
  savedViewLegacyFields,
  toDashboardSavedView,
} from "@/src/lib/saved-view-contract";
import { SavedViewWriteConflictError, withSavedViewWrite } from "@/src/lib/saved-view-write";

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

    const view = await withSavedViewWrite(async (tx) => {
      const count = await tx.savedView.count({
        where: { userId: user.id },
      });
      if (count >= MAX_SAVED_VIEWS) return null;

      // Deleting a view never renumbers the ones that survive it, so
      // `count` can collide with a still-in-use position after a delete
      // (e.g. views at 0/1/2, delete 1, count is now 2 — but so is the
      // survivor's position). Go one past the current max instead.
      const { _max } = await tx.savedView.aggregate({
        where: { userId: user.id },
        _max: { position: true },
      });
      const position = (_max.position ?? -1) + 1;

      return tx.savedView.create({
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
    });
    if (!view) {
      return jsonError(`Saved view limit reached (max ${MAX_SAVED_VIEWS})`, 409);
    }

    return Response.json({ view: toDashboardSavedView(view) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    if (error instanceof SavedViewWriteConflictError) {
      return jsonError(error.message, 503);
    }
    return jsonError("Failed to create saved view", 500);
  }
}
