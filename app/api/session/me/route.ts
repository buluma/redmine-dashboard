import { prisma } from "@/src/lib/db";
import { getSessionUserId, clearSessionCookie } from "@/src/lib/session";

export async function GET() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return Response.json({ user: null });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ user: null });
    }

    return Response.json({
      user: {
        id: user.id,
        username: user.emailOrUsername,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load session";
    return Response.json({ user: null, error: message }, { status: 500 });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
