import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

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
