import { requireMobileUser, requireRedmineClientForUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { syncSingleIssue } from "@/src/lib/sync";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Invalid issue id");
  }
  return n;
}

function statusFromRedmineError(message: string): number | null {
  const match = message.match(/Redmine request failed \((\d{3})\):/);
  if (!match) return null;
  return Number(match[1]);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);

    const issue = await prisma.issue.findFirst({
      where: { userId: user.id, redmineIssueId: issueId },
      include: { attachments: { orderBy: { createdOnRemote: "desc" } } },
    });

    if (!issue) {
      return jsonError("Issue not found", 404);
    }

    return Response.json({ items: issue.attachments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch attachments";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMobileApiEnabled();
    const { id } = await context.params;
    const issueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);
    const { client } = await requireRedmineClientForUser(user.id);

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

    return Response.json({ ok: true, items: attachments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload attachment";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : message === "Issue not found"
            ? 404
            : (statusFromRedmineError(message) ?? 400);
    return jsonError(message, status);
  }
}
