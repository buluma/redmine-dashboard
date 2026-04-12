import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);

    if (isNaN(issueId)) return jsonError("Invalid issue ID", 400);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const existing = await prisma.favorite.findUnique({
      where: { userId_issueId: { userId: user.id, issueId } },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return Response.json({ favorited: false });
    }

    await prisma.favorite.create({
      data: { userId: user.id, issueId },
    });
    return Response.json({ favorited: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to toggle favorite", 500);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseInt(id, 10);

    const favorite = await prisma.favorite.findUnique({
      where: { userId_issueId: { userId: user.id, issueId } },
    });

    return Response.json({ favorited: !!favorite });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to check favorite", 500);
  }
}
