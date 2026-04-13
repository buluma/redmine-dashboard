import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, level = "error", source = "client", url, stack, userAgent, meta } = body;

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    let userId: string | null = null;
    try {
      const user = await requireCurrentUser();
      userId = user.id;
    } catch {
      // Anonymous error log
    }

    await prisma.webLog.create({
      data: {
        userId,
        message: message.slice(0, 10000),
        level: level.slice(0, 20),
        source: source?.slice(0, 50),
        url: url?.slice(0, 2048),
        stack: stack?.slice(0, 10000),
        userAgent: userAgent?.slice(0, 500),
        meta: meta ?? null,
      },
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to log" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const source = searchParams.get("source");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (source) where.source = source;

    const logs = await prisma.webLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      items: logs.map((l) => ({
        ...l,
        meta: l.meta as unknown,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get("olderThan");

    const where: Record<string, unknown> = {};
    if (olderThan) {
      where.createdAt = { lte: new Date(olderThan) };
    }

    const result = await prisma.webLog.deleteMany({ where });
    return Response.json({ deleted: result.count });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ error: "Failed to clear logs" }, { status: 500 });
  }
}
