import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { isRateLimited } from "@/src/lib/rate-limit";
import { statusUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \\((\\d{3})\\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, statusUpdateSchema);
    const { user, client } = await requireRedmineClient();
    logEvent("issue.status.update.requested", {
      userId: user.id,
      issueId,
      statusId: body.statusId,
    });
    const limiter = isRateLimited({
      key: `${user.id}:issue-status`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      logEvent("issue.status.update.rate_limited", { userId: user.id, issueId }, "warn");
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const detail = await client.getIssue(issueId, ["allowed_statuses"]);
    const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number }> };
    const allowed = (issueMeta.allowed_statuses ?? []).map((x) => x.id);

    if (allowed.length > 0 && !allowed.includes(body.statusId)) {
      return jsonError("Status transition is not allowed for this issue", 400);
    }

    await client.updateIssueStatus(issueId, body.statusId, body.note);
    const issue = await syncSingleIssue(user.id, client, issueId);
    logEvent("issue.status.update.succeeded", {
      userId: user.id,
      issueId,
      statusId: body.statusId,
    });

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update status";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    logEvent("issue.status.update.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { client } = await requireRedmineClient();

    const detail = await client.getIssue(issueId, ["allowed_statuses"]);
    const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number; name: string }> };
    const allowedStatuses = issueMeta.allowed_statuses ?? [];

    return Response.json({
      issueId,
      allowedStatuses,
      allowedStatusIds: allowedStatuses.map((s) => s.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch allowed statuses";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
