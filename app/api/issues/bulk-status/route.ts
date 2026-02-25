import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { isRateLimited } from "@/src/lib/rate-limit";
import { bulkStatusUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function POST(request: Request) {
  try {
    const payload = await parseJson(request, bulkStatusUpdateSchema);
    const issueIds = Array.from(new Set(payload.issueIds));
    const { user, client } = await requireRedmineClient();

    const limiter = isRateLimited({
      key: `${user.id}:issue-bulk-status`,
      max: 8,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    let updatedCount = 0;
    const failures: Array<{ issueId: number; error: string }> = [];

    for (const issueId of issueIds) {
      try {
        const detail = await client.getIssue(issueId, ["allowed_statuses"]);
        const issueMeta = detail.issue as { allowed_statuses?: Array<{ id: number }> };
        const allowed = (issueMeta.allowed_statuses ?? []).map((entry) => entry.id);

        if (allowed.length > 0 && !allowed.includes(payload.statusId)) {
          failures.push({ issueId, error: "Status transition is not allowed for this issue" });
          continue;
        }

        await client.updateIssueStatus(issueId, payload.statusId, payload.note);
        await syncSingleIssue(user.id, client, issueId);
        updatedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Update failed";
        failures.push({ issueId, error: message });
      }
    }

    if (updatedCount === 0 && failures.length > 0) {
      return Response.json(
        {
          error: "No issue was updated.",
          failures,
          updatedCount,
          failedCount: failures.length,
        },
        { status: 400 },
      );
    }

    return Response.json({
      ok: failures.length === 0,
      updatedCount,
      failedCount: failures.length,
      failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to bulk update issues";
    const status = message === "Unauthorized" ? 401 : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
