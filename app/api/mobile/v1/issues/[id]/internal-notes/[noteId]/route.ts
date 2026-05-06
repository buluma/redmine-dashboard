import { requireMobileUser } from "@/src/lib/auth";
import {
  recomputeIssueActivityIndex,
  recordIssueActivityEvent,
} from "@/src/lib/activity-index";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { assertMobileApiEnabled } from "@/src/lib/mobile-api";
import { isRateLimited } from "@/src/lib/rate-limit";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

function parseIssueId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid issue id");
  return n;
}

function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; noteId: string }> },
) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { id, noteId } = await context.params;
    const redmineIssueId = parseIssueId(id);
    const { user } = await requireMobileUser(request);
    trackInfo("mobile.issue.internal_note.delete.requested", {
      userId: user.id,
      redmineIssueId,
      noteId,
    });

    const limiter = isRateLimited({
      key: `${user.id}:mobile-issue-internal-note-delete`,
      max: 30,
      windowMs: 60_000,
    });
    if (limiter.limited) {
      trackFailure({
        event: "mobile.issue.internal_note.delete.rate_limited",
        error: "mobile issue internal note delete rate-limited",
        level: "warn",
        data: { userId: user.id, redmineIssueId },
        metricName: "mobile_issue_internal_note_delete_rate_limited",
        metricTags: { reason: "rate_limited" },
        durationMetricName: "mobile_issue_internal_note_delete_duration",
        durationMs: Date.now() - startedAt,
      });
      return jsonError("Rate limit exceeded. Try again shortly.", 429);
    }

    const issue = await prisma.issue.findFirst({
      where: { redmineIssueId, userId: user.id },
      select: { id: true },
    });
    if (!issue) return jsonError("Issue not found", 404);

    const deleted = await prisma.internalNote.deleteMany({
      where: { id: noteId, issueId: issue.id, userId: user.id },
    });
    if (deleted.count === 0) return jsonError("Note not found", 404);

    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "internal_note",
      source: "local",
      sourceRemoteId: `${noteId}:deleted`,
      eventAt: new Date(),
      summary: "Internal note deleted",
    });
    await recomputeIssueActivityIndex(issue.id);

    trackSuccess({
      event: "mobile.issue.internal_note.delete.succeeded",
      data: { userId: user.id, redmineIssueId, noteId },
      metricName: "mobile_issue_internal_note_delete_succeeded",
      durationMetricName: "mobile_issue_internal_note_delete_duration",
      durationMs: Date.now() - startedAt,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete note";
    const status =
      message === "Mobile API is disabled"
        ? 404
        : message === "Unauthorized"
          ? 401
          : 400;
    trackFailure({
      event: "mobile.issue.internal_note.delete.failed",
      error,
      data: { status },
      metricName: "mobile_issue_internal_note_delete_failed",
      metricTags: { status_class: statusClass(status) },
      durationMetricName: "mobile_issue_internal_note_delete_duration",
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message, status);
  }
}
