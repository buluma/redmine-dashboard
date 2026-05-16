import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { trackFailure } from "@/src/lib/telemetry";

export async function GET() {
  const user = await requireCurrentUser();

  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ favorites: favorites.map(f => f.issueId) });
  } catch (error) {
    trackFailure({ event: "issues.favorites.list.failed", error, metricName: "issues_favorites_list_failed" });
    return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
  }
}
