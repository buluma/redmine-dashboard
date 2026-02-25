import { requireRedmineClient } from "@/src/lib/auth";
import { jsonError, parseJson } from "@/src/lib/http";
import { statusUpdateSchema } from "@/src/lib/schemas";
import { syncSingleIssue } from "@/src/lib/sync";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const body = await parseJson(request, statusUpdateSchema);
    const { user, client } = await requireRedmineClient();

    const detail = await client.getIssue(issueId, ["allowed_statuses"]);
    const allowed = ((detail.issue.allowed_statuses as Array<{ id: number }> | undefined) ?? []).map(
      (x) => x.id,
    );

    if (allowed.length > 0 && !allowed.includes(body.statusId)) {
      return jsonError("Status transition is not allowed for this issue", 400);
    }

    await client.updateIssueStatus(issueId, body.statusId, body.note);
    const issue = await syncSingleIssue(user.id, client, issueId);

    return Response.json({ ok: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update status";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
