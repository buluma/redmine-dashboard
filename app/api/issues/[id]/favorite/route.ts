import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { trackFailure } from "@/src/lib/telemetry";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  
  if (isNaN(issueId)) {
    return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
  }

  try {
    // Check if already favorited
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_issueId: {
          userId: user.id,
          issueId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ favorited: true, message: "Already favorited" });
    }

    // Create favorite
    const favorite = await prisma.favorite.create({
      data: {
        userId: user.id,
        issueId,
      },
    });

    return NextResponse.json({ favorited: true, favorite });
  } catch (error) {
    trackFailure({ event: "issues.favorite.add.failed", error, metricName: "issues_favorite_add_failed" });
    return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  
  if (isNaN(issueId)) {
    return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
  }

  try {
    await prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        issueId,
      },
    });

    return NextResponse.json({ favorited: false });
  } catch (error) {
    trackFailure({ event: "issues.favorite.remove.failed", error, metricName: "issues_favorite_remove_failed" });
    return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const issueId = parseInt(id, 10);
  
  if (isNaN(issueId)) {
    return NextResponse.json({ error: "Invalid issue ID" }, { status: 400 });
  }

  try {
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_issueId: {
          userId: user.id,
          issueId,
        },
      },
    });

    return NextResponse.json({ favorited: !!favorite });
  } catch (error) {
    trackFailure({ event: "issues.favorite.check.failed", error, metricName: "issues_favorite_check_failed" });
    return NextResponse.json({ error: "Failed to check favorite" }, { status: 500 });
  }
}
