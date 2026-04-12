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
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch AI summary count" },
      { status: 500 }
    );
  }
}
