import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { trackFailure, trackInfo } from "@/src/lib/telemetry";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function parseAttachmentId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid attachment id");
  }
  return n;
}

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  const startedAt = Date.now();
  try {
    const { id, attachmentId } = await context.params;
    const issueId = parseIssueId(id);
    const parsedAttachmentId = parseAttachmentId(attachmentId);

    trackInfo("attachment.download.requested", { issueId, attachmentId: parsedAttachmentId });

    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });

    if (!issue) {
      trackInfo("attachment.download.issue_not_found", { issueId, userId: user.id });
      return jsonError("Issue not found", 404);
    }

    const attachment = await prisma.issueAttachment.findFirst({
      where: { issueId: issue.id, redmineAttachmentId: parsedAttachmentId },
    });

    if (!attachment) {
      trackInfo("attachment.download.attachment_not_found", { attachmentId: parsedAttachmentId, issueId: issue.id });
      return jsonError("Attachment not found", 404);
    }

    trackInfo("attachment.download.fetching", { 
      attachmentId: parsedAttachmentId, 
      downloadUrl: attachment.downloadUrl 
    });

    const upstream = await client.downloadAttachment(attachment.downloadUrl);
    
    // Check if the response is valid
    if (!upstream.ok) {
      const errorBody = await upstream.text().catch(() => "unknown");
      trackFailure({
        event: "attachment.download.redmine_failed",
        error: new Error(`Redmine returned ${upstream.status}`),
        data: { status: upstream.status, body: errorBody.slice(0, 200) },
        metricName: "attachment_download_failed",
        durationMs: Date.now() - startedAt,
      });
      return jsonError(`Redmine error: ${upstream.status}`, upstream.status);
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type") ?? attachment.contentType ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    headers.set("content-type", contentType);
    headers.set("content-disposition", `inline; filename="${attachment.filename}"`);
    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    trackInfo("attachment.download.succeeded", { 
      attachmentId: parsedAttachmentId, 
      contentType,
      durationMs: Date.now() - startedAt 
    });

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download attachment";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Issue not found" || message === "Attachment not found"
          ? 404
          : (statusFromRedmineError(message) ?? 400);
    
    // Log error locally
    console.error("attachment_download_error:", error);
    
    trackFailure({
      event: "attachment.download.failed",
      error,
      data: { status, message },
      metricName: "attachment_download_error",
      durationMs: Date.now() - startedAt,
    });
    
    return jsonError(message, status);
  }
}