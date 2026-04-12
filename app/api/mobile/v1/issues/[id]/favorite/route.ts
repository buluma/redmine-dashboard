import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseIssueId(id);

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
    const message = error instanceof Error ? error.message : "Unable to toggle favorite";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    const { id } = await context.params;
    const issueId = parseIssueId(id);

    const favorite = await prisma.favorite.findUnique({
      where: { userId_issueId: { userId: user.id, issueId } },
    });

    return Response.json({ favorited: !!favorite });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check favorite";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
