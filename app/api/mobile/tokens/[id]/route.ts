import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    const updated = await prisma.mobileApiToken.updateMany({
      where: {
        id,
        userId: user.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) {
      return jsonError("Token not found", 404);
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to revoke token";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
