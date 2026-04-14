import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    
    const count = await prisma.aiSummary.count({
      where: { issue: { userId: user.id } },
    });

    return Response.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch AI summary count";
    if (message.includes("statement timeout") || message.includes("code: \"57014\"") || message.includes("P2024")) {
      return Response.json({ count: 0, degraded: true });
    }
    return Response.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
