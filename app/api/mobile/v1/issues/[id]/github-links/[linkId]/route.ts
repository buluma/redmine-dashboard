import { requireMobileUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { isRateLimited } from "@/src/lib/rate-limit";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; linkId: string }> },
) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { id, linkId } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);
    trackInfo("mobile.issue.github_link.delete.requested", {
      userId: user.id,
      redmineIssueId,
      linkId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:mobile-issue-github-link-delete`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "mobile.issue.github_link.delete.rate_limited",
        error: "mobile issue github link delete rate-limited",
        level: "warn",
        data: { userId: user.id, redmineIssueId },
        metricName: "mobile_issue_github_link_delete_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "mobile_issue_github_link_delete_duration",
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

    const deleted = await prisma.issueGithubLink.deleteMany({
      where: {
        id: linkId,
        issueId: issue.id,
        userId: user.id,
      },
    });
    if (deleted.count === 0) {
      return jsonError("Link not found", 404);
    }

    trackSuccess({
      event: "mobile.issue.github_link.delete.succeeded",
      data: {
        userId: user.id,
        redmineIssueId,
        linkId,
      },
      metricName: "mobile_issue_github_link_delete_succeeded",
      durationMetricName: "mobile_issue_github_link_delete_duration",
      durationMs: Date.now() - startedAt,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete GitHub link";
    const status = message === "Mobile API is disabled" ? 404 : message === "Unauthorized" ? 401 : 400;
    trackFailure({
      event: "mobile.issue.github_link.delete.failed",
      error,
      data: { status },
      metricName: "mobile_issue_github_link_delete_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "mobile_issue_github_link_delete_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
