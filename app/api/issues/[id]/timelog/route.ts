import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { logEvent } from "@/src/lib/log";
import { isRateLimited } from "@/src/lib/rate-limit";
import { timeLogSchema } from "@/src/lib/schemas";
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
    const body = await parseJson(request, timeLogSchema);
    const { user, client } = await requireRedmineClient();
    logEvent("issue.timelog.add.requested", {
      userId: user.id,
      issueId,
      hours: body.hours,
      activityId: body.activityId,
    });
    const limiter = isRateLimited({
      key: `${user.id}:issue-timelog`,
      max: 20,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      logEvent("issue.timelog.add.rate_limited", { userId: user.id, issueId }, "warn");
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const spentOn = body.spentOn ?? new Date().toISOString().slice(0, 10);
    const res = await client.addTimeEntry({
      issueId,
      hours: body.hours,
      activityId: body.activityId,
      comments: body.comment,
      spentOn,
    });

    await syncSingleIssue(user.id, client, issueId);
    logEvent("issue.timelog.add.succeeded", {
      userId: user.id,
      issueId,
      redmineTimeEntryId: res?.time_entry?.id ?? null,
    });

    return Response.json({ ok: true, timeEntryId: res?.time_entry?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add timelog";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    logEvent("issue.timelog.add.failed", { status, error: message }, "error");
    return jsonError(message, status);
  }
}
