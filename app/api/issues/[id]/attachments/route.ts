import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { redmineMessageFromError, redmineStatusFromError } from "@/src/lib/redmine";
import { syncSingleIssue, upsertAttachmentsForIssue } from "@/src/lib/sync";
import { trackFailure, trackSuccess } from "@/src/lib/telemetry";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      include: { attachments: { orderBy: { createdOnRemote: "desc" } } },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const refreshRequested = new URL(request.url).searchParams.get("refresh") === "1";
    if (refreshRequested) {
      try {
        const detail = await client.getIssue(issueId, ["attachments"]);
        await upsertAttachmentsForIssue(issue.id, (detail.issue ?? {}) as Record<string, unknown>, true);
      } catch {
        // Fall back to currently cached attachment rows when Redmine refresh fails.
      }
    }

    const attachments = await prisma.issueAttachment.findMany({
      where: { issueId: issue.id },
      orderBy: { createdOnRemote: "desc" },
    });
    return Response.json({ items: attachments });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to fetch attachments");
    const status = message === "Unauthorized" ? 401 : (redmineStatusFromError(error) ?? 400);
    return jsonError(message, status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("Missing file", 400);
    }
    if (!file.name.trim()) {
      return jsonError("Missing filename", 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError("File too large (max 10MB)", 400);
    }

    const upload = await client.uploadFile({
      filename: file.name,
      contentType: file.type || undefined,
      bytes: await file.arrayBuffer(),
    });

    await client.addIssueAttachment({
      issueId,
      token: upload.token,
      filename: file.name,
      contentType: file.type || undefined,
      description: typeof form.get("description") === "string" ? String(form.get("description")).trim() : undefined,
    });

    await syncSingleIssue(user.id, client, issueId, {
      pruneAttachments: true,
      pruneRelations: true,
      pruneTimeEntries: false,
    });

    const attachments = await prisma.issueAttachment.findMany({
      where: { issueId: issue.id },
      orderBy: { createdOnRemote: "desc" },
    });

    trackSuccess({
      event: "issue.attachments.upload.succeeded",
      data: { userId: user.id, issueId, filename: file.name, size: file.size },
      metricName: "issue_attachments_upload_succeeded",
      durationMetricName: "issue_attachments_upload_duration",
      durationMs: Date.now() - startedAt,
    });

    return Response.json({ ok: true, items: attachments });
  } catch (error) {
    const message = redmineMessageFromError(error, "Unable to upload attachment");
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Issue not found"
          ? 404
          : (redmineStatusFromError(error) ?? 400);

    trackFailure({
      event: "issue.attachments.upload.failed",
      error,
      data: { status },
      metricName: "issue_attachments_upload_failed",
      durationMetricName: "issue_attachments_upload_duration",
      durationMs: Date.now() - startedAt,
    });

    return jsonError(message, status);
  }
}
