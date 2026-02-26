import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { isRateLimited } from "@/src/lib/rate-limit";
import { githubLinkCreateSchema } from "@/src/lib/schemas";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function buildGithubUrl(input: {
  repositoryFullName: string;
  githubIssueNumber?: number;
  githubPrNumber?: number;
  url?: string;
}): string {
  if (input.url) {
    return input.url;
  }

  const base = `https://github.com/${input.repositoryFullName}`;
  if (input.githubIssueNumber) {
    return `${base}/issues/${input.githubIssueNumber}`;
  }
  if (input.githubPrNumber) {
    return `${base}/pull/${input.githubPrNumber}`;
  }
  return base;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const user = await requireCurrentUser();

    const issue = await prisma.issue.findFirst({
      where: {
        redmineIssueId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const links = await prisma.issueGithubLink.findMany({
      where: {
        issueId: issue.id,
        userId: user.id,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ items: links });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch GitHub links";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const user = await requireCurrentUser();
    const payload = await parseJson(request, githubLinkCreateSchema);
    logEvent("issue.github_link.create.requested", {
      userId: user.id,
      redmineIssueId,
      repository: payload.repositoryFullName,
      githubIssueNumber: payload.githubIssueNumber ?? null,
      githubPrNumber: payload.githubPrNumber ?? null,
    });

    const limiter = isRateLimited({
      key: `${user.id}:issue-github-link`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      logEvent("issue.github_link.create.rate_limited", { userId: user.id, redmineIssueId }, "warn");
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const issue = await prisma.issue.findFirst({
      where: {
        redmineIssueId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const url = buildGithubUrl(payload);

    const link = await prisma.issueGithubLink.upsert({
      where: {
        issueId_url: {
          issueId: issue.id,
          url,
        },
      },
      update: {
        repositoryFullName: payload.repositoryFullName,
        githubIssueNumber: payload.githubIssueNumber ?? null,
        githubPrNumber: payload.githubPrNumber ?? null,
        title: payload.title ?? null,
      },
      create: {
        issueId: issue.id,
        userId: user.id,
        repositoryFullName: payload.repositoryFullName,
        githubIssueNumber: payload.githubIssueNumber ?? null,
        githubPrNumber: payload.githubPrNumber ?? null,
        url,
        title: payload.title ?? null,
      },
    });

    logEvent("issue.github_link.create.succeeded", {
      userId: user.id,
      redmineIssueId,
      linkId: link.id,
    });

    return Response.json({ ok: true, link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create GitHub link";
    const status = message === "Unauthorized" ? 401 : 400;
    logEvent("issue.github_link.create.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
