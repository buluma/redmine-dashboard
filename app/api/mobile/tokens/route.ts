import { requireCurrentUser } from "@/src/lib/auth";
import { createMobileToken } from "@/src/lib/mobile-auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : null;
    const result = await createMobileToken(user.id, name || undefined);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create token";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const items = await prisma.mobileApiToken.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load mobile tokens";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
