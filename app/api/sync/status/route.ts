import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";
import { jsonError } from "@/src/lib/http";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const [state, latestJob] = await Promise.all([
      prisma.syncState.findUnique({ where: { userId: user.id } }),
      prisma.syncJob.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    ]);

    return Response.json({
      state,
      latestJob,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch sync status";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
