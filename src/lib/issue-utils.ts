import type { Attachment, Issue, SyncState, SavedView } from "@/src/types/dashboard";

export function normalizeAttachmentFilename(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  const baseName = decoded.split("/").pop() ?? decoded;
  return baseName.toLowerCase();
}

export function filenamesMatch(left: string, right: string): boolean {
  return normalizeAttachmentFilename(left) === normalizeAttachmentFilename(right);
}

export function attachmentUrl(issueId: number, attachmentId: number): string {
  return `/api/issues/${issueId}/attachments/${attachmentId}`;
}

export function redmineIssueUrl(issue: Pick<Issue, "redmineBaseUrl" | "redmineIssueId">): string | null {
  const baseUrl = issue.redmineBaseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/issues/${issue.redmineIssueId}`;
}

export function isImageAttachment(attachment: Attachment): boolean {
  const type = (attachment.contentType ?? "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = attachment.filename.toLowerCase();
  return (
    name.endsWith(".png")
    || name.endsWith(".jpg")
    || name.endsWith(".jpeg")
    || name.endsWith(".gif")
    || name.endsWith(".webp")
    || name.endsWith(".bmp")
  );
}

export function isPdfAttachment(attachment: Attachment): boolean {
  const type = (attachment.contentType ?? "").toLowerCase();
  if (type === "application/pdf") return true;
  return attachment.filename.toLowerCase().endsWith(".pdf");
}

export function normalizeStatus(statusName: string): string {
  return statusName.toLowerCase();
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function isOpenStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return !s.includes("closed") && !s.includes("resolved") && !s.includes("done");
}

export function isInProgressStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("progress") || s.includes("in dev") || s.includes("ongoing");
}

export function isDoneStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("resolved") || s.includes("closed") || s.includes("done");
}

export function isBlockedStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("blocked") || s.includes("hold") || s.includes("waiting");
}

export function dueInDays(dueDate: string | null): number | null {
  if (!dueDate) {
    return null;
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function issueUrgency(issue: Issue): "overdue" | "soon" | "done" | "normal" {
  if (isDoneStatus(issue.statusName)) {
    return "done";
  }
  const days = dueInDays(issue.dueDate);
  if (days === null) {
    return "normal";
  }
  if (days < 0) {
    return "overdue";
  }
  if (days <= 3) {
    return "soon";
  }
  return "normal";
}

export function syncTone(status: string | undefined): "idle" | "running" | "success" | "failed" {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "idle";
}

export function summarizeSyncError(message: string | null | undefined, t: (key: string) => string): string {
  if (!message) {
    return t('sync.noDetailError');
  }

  if (message.includes("Unknown argument `parentIssueId`")) {
    return t('sync.prismaOutdatedError');
  }

  const firstLine = message
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return t('sync.noDetailError');
  }

  const redmine = firstLine.match(/Redmine request failed \(\d{3}\):\s*(.+)$/i);
  if (redmine?.[1]) {
    return redmine[1].slice(0, 220);
  }

  return firstLine.slice(0, 220);
}

export function latestSyncTimestamp(state: SyncState): string | null {
  if (!state) {
    return null;
  }
  const candidates = [state.lastIncrementalSyncAt, state.lastFullSyncAt].filter(
    (value): value is string => Boolean(value),
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

export function dayDiffFromNow(dateLike: string): number {
  const target = new Date(dateLike).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.floor((Date.now() - target) / (24 * 60 * 60 * 1000));
}

export function latestIssueActivityTimestamp(issue: Pick<Issue, "updatedOnRemote" | "lastActivityAt">): string {
  return issue.lastActivityAt ?? issue.updatedOnRemote;
}

export function activityTypeLabel(type: string | null | undefined): string {
  const normalized = (type ?? "").trim().toLowerCase();
  if (!normalized) return "issue update";
  if (normalized === "issue_update") return "issue update";
  return normalized.replace(/_/g, " ");
}

export function matchesView(view: SavedView, state: {
  statusFilter: string;
  priorityFilter: string;
  search: string;
  sort: string;
}): boolean {
  return (
    view.statusFilter === state.statusFilter
    && view.priorityFilter === state.priorityFilter
    && view.search === state.search
    && view.sort === state.sort
  );
}

export function formatDurationFromMs(durationMs: number): string {
  const safe = Math.max(0, durationMs);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

// Single definition of "valid remote Redmine id": local tickets carry
// redmineIssueId null, so every numeric consumer must go through this guard.
export function issueNumericId(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function normalizeIssueRouteId(value: number | string | null | undefined): string | null {
  if (typeof value === "number") {
    const numeric = issueNumericId(value);
    return numeric === null ? null : String(numeric);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

export function issueRouteId(issue: Pick<Issue, "id" | "redmineIssueId">): string {
  return normalizeIssueRouteId(issue.redmineIssueId) ?? issue.id;
}

export function issueDisplayId(issue: Pick<Issue, "redmineIssueId" | "localIssueNumber">): string {
  const remote = normalizeIssueRouteId(issue.redmineIssueId);
  if (remote) {
    return `#${remote}`;
  }
  if (typeof issue.localIssueNumber === "number" && issue.localIssueNumber > 0) {
    // Matches the external API's local-ticket convention (L-5), and keeps
    // local numbering visually distinct from Redmine's #<id> space.
    return `L-${issue.localIssueNumber}`;
  }
  return "#";
}

export function openIssueIdInNewTab(issueId: number | string | null | undefined): void {
  const routeId = normalizeIssueRouteId(issueId);
  if (!routeId) {
    return;
  }
  window.open(`/issues/${encodeURIComponent(routeId)}`, "_blank", "noopener,noreferrer");
}

export function openIssueInNewTab(issue: Pick<Issue, "id" | "redmineIssueId">): void {
  openIssueIdInNewTab(issueRouteId(issue));
}
