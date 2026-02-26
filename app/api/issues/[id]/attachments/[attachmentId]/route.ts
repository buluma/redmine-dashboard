import { requireRedmineClient } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

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
  try {
    const { id, attachmentId } = await context.params;
    const issueId = parseIssueId(id);
    const parsedAttachmentId = parseAttachmentId(attachmentId);
    const { user, client } = await requireRedmineClient();

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      select: { id: true },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    const attachment = await prisma.issueAttachment.findFirst({
      where: { issueId: issue.id, redmineAttachmentId: parsedAttachmentId },
    });

    if (!attachment) {
      return jsonError("Attachment not found", 404);
    }

    const upstream = await client.downloadAttachment(attachment.downloadUrl);
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type") ?? attachment.contentType ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    headers.set("content-type", contentType);
    headers.set("content-disposition", `inline; filename="${attachment.filename}"`);
    if (contentLength) {
      headers.set("content-length", contentLength);
    }

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download attachment";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Issue not found" || message === "Attachment not found"
          ? 404
          : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
