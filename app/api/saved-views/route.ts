import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

// GET /api/saved-views - List all saved views for current user
export async function GET() {
  try {
    const user = await requireCurrentUser();
    
    const views = await prisma.savedView.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
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
      },
    });

    return Response.json({ views });
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
    const body = await request.json();
    
    const { name, project, status, search, sortBy, sortOrder, statusIds, priorityIds, assignedToMe, dueInDays, isDefault } = body;
    
    if (!name || typeof name !== "string") {
      return jsonError("name is required", 400);
    }
    
    // If setting as default, clear other defaults first
    if (isDefault) {
      await prisma.savedView.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    
    const view = await prisma.savedView.create({
      data: {
        userId: user.id,
        name,
        project: project ?? null,
        status: status ?? "open",
        search: search ?? null,
        sortBy: sortBy ?? "updated",
        sortOrder: sortOrder ?? "desc",
        statusIds: statusIds ?? [],
        priorityIds: priorityIds ?? [],
        assignedToMe: assignedToMe ?? false,
        dueInDays: dueInDays ?? null,
        isDefault: isDefault ?? false,
      },
    });
    
    return Response.json({ view }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to create saved view", 500);
  }
}