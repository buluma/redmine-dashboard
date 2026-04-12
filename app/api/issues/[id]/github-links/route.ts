import { requireCurrentUser } from "@/src/lib/auth";
import { recomputeIssueActivityIndex, recordIssueActivityEvent } from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { githubLinkCreateSchema } from "@/src/lib/schemas";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

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

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
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
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const user = await requireCurrentUser();
    const payload = await parseJson(request, githubLinkCreateSchema);
    trackInfo("issue.github_link.create.requested", {
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
      trackFailure({
        event: "issue.github_link.create.rate_limited",
        error: "issue github link create rate-limited",
        level: "warn",
        data: { userId: user.id, redmineIssueId },
        metricName: "issue_github_link_create_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "issue_github_link_create_duration",
        durationMs: Date.now() - startedAt,
      });
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
    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "github_link",
      source: "local",
      sourceRemoteId: link.id,
      eventAt: link.updatedAt,
      summary: link.url,
    });
    await recomputeIssueActivityIndex(issue.id);

    trackSuccess({
      event: "issue.github_link.create.succeeded",
      data: {
        userId: user.id,
        redmineIssueId,
        linkId: link.id,
      },
      metricName: "issue_github_link_create_succeeded",
      durationMetricName: "issue_github_link_create_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, link });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create GitHub link";
    const status = message === "Unauthorized" ? 401 : 400;
    trackFailure({
      event: "issue.github_link.create.failed",
      error,
      data: { status },
      metricName: "issue_github_link_create_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "issue_github_link_create_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
