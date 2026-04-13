"use client";

import { AllowedStatusView } from "@/src/lib/issue-shape";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { normalizeRedmineText, splitRedmineCollapseSegments } from "@/src/lib/redmine-text-format";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { AiSearchBar } from "@/src/components/ai/AiSearchBar";
import { DashboardWidgets, calculateStats } from "@/src/components/DashboardWidgets";
import { AdvancedFilters, applyFilters, type FilterState } from "@/src/components/AdvancedFilters";
import { ProjectFilter } from "@/src/components/ProjectFilter";
import { ExportButton } from "@/src/components/ExportButton";
import { ShortcutHelp } from "@/src/components/ShortcutHelp";
import { NotificationsPanel } from "@/src/components/NotificationsPanel";

type User = {
  id: string;
  username: string;
  displayName: string;
};

type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  createdOnRemote: string;
};

type TimeEntry = {
  id: string;
  redmineTimeEntryId: number | null;
  hours: number;
  activityId: number;
  activityName: string | null;
  authorName: string | null;
  comments: string | null;
  spentOn: string;
};

type GithubLink = {
  id: string;
  repositoryFullName: string;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  url: string;
  title: string | null;
  createdAt: string;
};

type Attachment = {
  id: string;
  redmineAttachmentId: number;
  filename: string;
  filesize: number;
  contentType: string | null;
  author: string | null;
  createdOnRemote: string | null;
};

type Relation = {
  id: string;
  redmineRelationId: number;
  targetIssueId: number;
  relationType: string;
  delay: number | null;
};

type IssueChild = {
  id: number;
  subject: string;
};

type Issue = {
  id: string;
  redmineIssueId: number;
  redmineBaseUrl: string;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  priorityName: string | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  updatedAt: string;
  updatedOnRemote: string;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  githubLinks: GithubLink[];
  journals: Journal[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  relations: Relation[];
  allowedStatuses: AllowedStatusView[];
  children: IssueChild[];
};

type StatusCatalog = { id: number; name: string; isClosed: boolean };

type SyncState = {
  lastSyncStatus: string;
  lastIncrementalSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  runningJobId: string | null;
} | null;

type BootstrapInfo = {
  configured: boolean;
  canBootstrap: boolean;
  activeCredentials: number;
} | null;

type SavedView = {
  id: string;
  name: string;
  statusFilter: string;
  priorityFilter: string;
  search: string;
  sort: string;
};

type ActivityEvent = {
  issueId: number;
  issueSubject: string;
  timestamp: string;
  detail: string;
};

const POLL_INTERVAL_MS = 90_000;
const SAVED_VIEWS_KEY = "nrcc.savedViews.v1";
const DEFAULT_ADVANCED_FILTERS: FilterState = {
  search: "",
  statusIds: [],
  priorityIds: [],
  assignedToMe: false,
  hasGithubLinks: false,
  hasAttachments: false,
};

function normalizeAttachmentFilename(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  const baseName = decoded.split("/").pop() ?? decoded;
  return baseName.toLowerCase();
}

function filenamesMatch(left: string, right: string): boolean {
  return normalizeAttachmentFilename(left) === normalizeAttachmentFilename(right);
}

function MarkdownBlock({ content, attachments = [], issueId }: { content: string; attachments?: Attachment[]; issueId?: number }) {
  const segments = useMemo(() => splitRedmineCollapseSegments(content), [content]);

  function textFromNode(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") {
      return String(node);
    }
    if (!node || typeof node !== "object") {
      return "";
    }
    if (Array.isArray(node)) {
      return node.map((part) => textFromNode(part)).join("");
    }
    const props = (node as { props?: { children?: ReactNode } }).props;
    return textFromNode(props?.children ?? "");
  }

  function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
    if (!src || typeof src === "object") return null;
    const srcText = src.toString();
    const attachmentMarker = "/api/issues/_ATTACHMENT_/";
    const filename = srcText.includes(attachmentMarker)
      ? decodeURIComponent(srcText.slice(srcText.indexOf(attachmentMarker) + attachmentMarker.length))
      : srcText.split("/").pop() ?? alt ?? "image";

    if (srcText.includes(attachmentMarker)) {
      const attachment = attachments.find((item) => filenamesMatch(item.filename, filename));
      if (!attachment || !issueId) return <span className="muted">[Image: {filename}]</span>;
      const url = attachmentUrl(issueId, attachment.redmineAttachmentId);
      return (
        <span className="markdown-image-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="attachment-preview-image clickable" src={url} alt={alt ?? filename} loading="lazy" />
        </span>
      );
    }

    return (
      <span className="markdown-image-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="attachment-preview-image clickable" src={srcText} alt={alt ?? filename} loading="lazy" />
      </span>
    );
  }

  function createCodePre(disableCollapse: boolean) {
    return function CodePre(props: { children?: ReactNode }) {
      if (disableCollapse) {
        return <pre>{props.children}</pre>;
      }
      const raw = textFromNode(props.children ?? "");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0).length;
      const shouldCollapse = lines >= 10 || raw.trim().length >= 80;
      if (!shouldCollapse) {
        return <pre>{props.children}</pre>;
      }
      return (
        <details className="md-collapsible-code">
          <summary>Show code ({lines} lines)</summary>
          <pre>{props.children}</pre>
        </details>
      );
    };
  }

  function renderMarkdown(markdown: string, key: string, options?: { disableCodeCollapse?: boolean }) {
    const normalized = normalizeRedmineText(markdown);
    if (!normalized.trim()) return null;
    const CodePre = createCodePre(options?.disableCodeCollapse ?? false);
    return (
      <ReactMarkdown
        key={key}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          pre: CodePre,
          img: MarkdownImage,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    );
  }

  return (
    <div className="markdown">
      {segments.map((segment, index) => {
        if (segment.type === "markdown") {
          return renderMarkdown(segment.content, `md-${index}`);
        }
        return (
          <details key={`collapse-${index}`} className="redmine-collapse">
            <summary>{segment.title}</summary>
            {renderMarkdown(segment.content, `collapse-body-${index}`, { disableCodeCollapse: true })}
          </details>
        );
      })}
    </div>
  );
}

function attachmentUrl(issueId: number, attachmentId: number): string {
  return `/api/issues/${issueId}/attachments/${attachmentId}`;
}

function redmineIssueUrl(issue: Pick<Issue, "redmineBaseUrl" | "redmineIssueId">): string | null {
  const baseUrl = issue.redmineBaseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/issues/${issue.redmineIssueId}`;
}

function isImageAttachment(attachment: Attachment): boolean {
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

function isPdfAttachment(attachment: Attachment): boolean {
  const type = (attachment.contentType ?? "").toLowerCase();
  if (type === "application/pdf") return true;
  return attachment.filename.toLowerCase().endsWith(".pdf");
}

function normalizeStatus(statusName: string): string {
  return statusName.toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isOpenStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return !s.includes("closed") && !s.includes("resolved") && !s.includes("done");
}

function isInProgressStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("progress") || s.includes("in dev") || s.includes("ongoing");
}

function isDoneStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("resolved") || s.includes("closed") || s.includes("done");
}

function isBlockedStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("blocked") || s.includes("hold") || s.includes("waiting");
}

function dueInDays(dueDate: string | null): number | null {
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

function issueUrgency(issue: Issue): "overdue" | "soon" | "done" | "normal" {
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

function syncTone(status: string | undefined): "idle" | "running" | "success" | "failed" {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "idle";
}

function summarizeSyncError(message: string | null | undefined): string {
  if (!message) {
    return "Sync failed with no detail from the server.";
  }

  if (message.includes("Unknown argument `parentIssueId`")) {
    return "Local Prisma client is outdated. Run `npm run prisma:generate` and restart the app.";
  }

  const firstLine = message
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "Sync failed with no detail from the server.";
  }

  const redmine = firstLine.match(/Redmine request failed \(\d{3}\):\s*(.+)$/i);
  if (redmine?.[1]) {
    return redmine[1].slice(0, 220);
  }

  return firstLine.slice(0, 220);
}

function latestSyncTimestamp(state: SyncState): string | null {
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

function dayDiffFromNow(dateLike: string): number {
  const target = new Date(dateLike).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.floor((Date.now() - target) / (24 * 60 * 60 * 1000));
}

function latestIssueActivityTimestamp(issue: Pick<Issue, "updatedOnRemote" | "lastActivityAt">): string {
  return issue.lastActivityAt ?? issue.updatedOnRemote;
}

function activityTypeLabel(type: string | null | undefined): string {
  const normalized = (type ?? "").trim().toLowerCase();
  if (!normalized) return "issue update";
  if (normalized === "issue_update") return "issue update";
  return normalized.replace(/_/g, " ");
}

function matchesView(view: SavedView, state: {
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

function formatDurationFromMs(durationMs: number): string {
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

function openIssueInNewTab(issueId: number): void {
  if (!Number.isInteger(issueId) || issueId <= 0) {
    return;
  }
  window.open(`/issues/${issueId}`, "_blank", "noopener,noreferrer");
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const fetchPageSize = 1000;
  const [statuses, setStatuses] = useState<StatusCatalog[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [searchSource, setSearchSource] = useState("local_cache");
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [bulkStatusId, setBulkStatusId] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [manualRefreshBusy, setManualRefreshBusy] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [allowedStatusIdsByIssue, setAllowedStatusIdsByIssue] = useState<Record<number, number[]>>({});
  const [bootstrapInfo, setBootstrapInfo] = useState<BootstrapInfo>(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ available: boolean; primaryModel: string; usingFallback: boolean } | null>(null);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [aiSummaryCount, setAiSummaryCount] = useState(0);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"local" | "hybrid">("local");
  const [sort, setSort] = useState("updated_desc");
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>(DEFAULT_ADVANCED_FILTERS);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewDraftName, setViewDraftName] = useState("");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [opsAlertsOpen, setOpsAlertsOpen] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [issueQueueOpen, setIssueQueueOpen] = useState(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIssueIds, setFavoriteIssueIds] = useState<number[]>([]);
  const [showCharts, setShowCharts] = useState(false);

  const [comment, setComment] = useState("");
  const [hours, setHours] = useState("1");
  const [activityId, setActivityId] = useState(0);
  const [timeComment, setTimeComment] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [githubRepo, setGithubRepo] = useState("");
  const [githubIssueNumber, setGithubIssueNumber] = useState("");
  const [githubPrNumber, setGithubPrNumber] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubTitle, setGithubTitle] = useState("");
  const [githubBusy, setGithubBusy] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [relationIssueToId, setRelationIssueToId] = useState("");
  const [relationType, setRelationType] = useState("relates");
  const [relationDelay, setRelationDelay] = useState("");
  const [relationBusy, setRelationBusy] = useState(false);

  const [timerIssueId, setTimerIssueId] = useState<number | null>(null);
  const [timerStartedAtMs, setTimerStartedAtMs] = useState<number | null>(null);
  const [timerNowMs, setTimerNowMs] = useState(Date.now());

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prefetchedIssueIdsRef = useRef<Set<number>>(new Set());

  const prefetchIssueDetail = useCallback((targetIssueId: number) => {
    if (!Number.isInteger(targetIssueId) || targetIssueId <= 0) {
      return;
    }
    if (prefetchedIssueIdsRef.current.has(targetIssueId)) {
      return;
    }
    prefetchedIssueIdsRef.current.add(targetIssueId);
    router.prefetch(`/issues/${targetIssueId}`);
    void fetch(`/api/issues/${targetIssueId}`, { cache: "no-store" }).catch(() => {
      prefetchedIssueIdsRef.current.delete(targetIssueId);
    });
  }, [router]);

  const selectedIssue = useMemo(
    () => issues.find((i) => i.redmineIssueId === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const priorityOptions = useMemo(() => {
    const discovered = new Map<number, string>();
    for (const issue of issues) {
      if (typeof issue.priorityId === "number" && issue.priorityId > 0) {
        discovered.set(issue.priorityId, issue.priorityName ?? issue.priority ?? `Priority ${issue.priorityId}`);
      }
    }

    if (discovered.size > 0) {
      return Array.from(discovered.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }

    return priorities.map((name, index) => ({ id: index + 1, name }));
  }, [issues, priorities]);

  const visibleIssues = useMemo(() => {
    let filtered = issues;

    if (selectedProject) {
      filtered = filtered.filter((issue) => issue.projectName === selectedProject);
    }

    filtered = applyFilters(filtered, advancedFilters);

    if (showFavoritesOnly) {
      filtered = filtered.filter((issue) => favoriteIssueIds.includes(issue.redmineIssueId));
    }

    return filtered;
  }, [advancedFilters, favoriteIssueIds, issues, selectedProject, showFavoritesOnly]);

  const timerElapsedMs = useMemo(() => {
    if (!timerStartedAtMs || !timerIssueId) {
      return 0;
    }
    return Math.max(0, timerNowMs - timerStartedAtMs);
  }, [timerIssueId, timerNowMs, timerStartedAtMs]);

  const allVisibleIssueIds = useMemo(() => visibleIssues.map((i) => i.redmineIssueId), [visibleIssues]);

  const selectedAllVisible = useMemo(
    () => allVisibleIssueIds.length > 0 && allVisibleIssueIds.every((id) => selectedIssueIds.includes(id)),
    [allVisibleIssueIds, selectedIssueIds],
  );

  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byPriority = new Map<string, number>();
    const atRiskCandidates: Array<{ issue: Issue; severity: number; reason: string }> = [];
    const activityFeed: ActivityEvent[] = [];

    let open = 0;
    let inProgress = 0;
    let done = 0;
    let blocked = 0;
    let overdue = 0;
    let dueSoon = 0;
    let stale = 0;
    let dueToday = 0;
    let totalProgress = 0;
    let openUpdateAgeDays = 0;

    for (const issue of visibleIssues) {
      byStatus.set(issue.statusName, (byStatus.get(issue.statusName) ?? 0) + 1);
      byPriority.set(issue.priority ?? "Unspecified", (byPriority.get(issue.priority ?? "Unspecified") ?? 0) + 1);

      const openState = isOpenStatus(issue.statusName);
      const blockedState = isBlockedStatus(issue.statusName);
      const urgency = issueUrgency(issue);
      const ageDays = dayDiffFromNow(latestIssueActivityTimestamp(issue));
      const daysToDue = dueInDays(issue.dueDate);

      if (openState) {
        open += 1;
        openUpdateAgeDays += ageDays;
      }
      if (isInProgressStatus(issue.statusName)) inProgress += 1;
      if (isDoneStatus(issue.statusName)) done += 1;
      if (blockedState) blocked += 1;
      if (urgency === "overdue") overdue += 1;
      if (urgency === "soon") dueSoon += 1;
      if (openState && ageDays >= 3) stale += 1;
      if (openState && daysToDue === 0) dueToday += 1;

      totalProgress += issue.doneRatio ?? 0;

      let severity = 0;
      const reasons: string[] = [];
      if (urgency === "overdue") {
        severity += 3;
        reasons.push("overdue");
      }
      if (blockedState) {
        severity += 2;
        reasons.push("blocked");
      }
      if (openState && ageDays >= 3) {
        severity += 1;
        reasons.push(`stale ${ageDays}d`);
      }
      if (severity > 0) {
        atRiskCandidates.push({ issue, severity, reason: reasons.join(" + ") });
      }

      activityFeed.push({
        issueId: issue.redmineIssueId,
        issueSubject: issue.subject,
        timestamp: latestIssueActivityTimestamp(issue),
        detail: `Latest activity: ${activityTypeLabel(issue.lastActivityType)}`,
      });

      for (const journal of issue.journals.slice(0, 3)) {
        activityFeed.push({
          issueId: issue.redmineIssueId,
          issueSubject: issue.subject,
          timestamp: journal.createdOnRemote,
          detail: `${journal.author ?? "Unknown"} commented`,
        });
      }

      for (const entry of issue.timeEntries.slice(0, 2)) {
        activityFeed.push({
          issueId: issue.redmineIssueId,
          issueSubject: issue.subject,
          timestamp: entry.spentOn,
          detail: `${entry.hours.toFixed(1)}h logged${entry.activityName ? ` (${entry.activityName})` : ""}`,
        });
      }
    }

    const topStatuses = Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const priorityMix = Array.from(byPriority.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const count = visibleIssues.length || 1;
    const completion = Math.round((done / count) * 100);
    const avgDoneRatio = Math.round(totalProgress / count);

    const atRisk = atRiskCandidates
      .sort((a, b) => {
        if (b.severity !== a.severity) return b.severity - a.severity;
        return new Date(latestIssueActivityTimestamp(a.issue)).getTime() - new Date(latestIssueActivityTimestamp(b.issue)).getTime();
      })
      .slice(0, 7);

    const recentActivity = activityFeed
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);

    return {
      totalVisible: visibleIssues.length,
      total,
      open,
      inProgress,
      done,
      blocked,
      overdue,
      dueSoon,
      stale,
      dueToday,
      completion,
      avgDoneRatio,
      avgOpenAgeDays: open > 0 ? Math.round(openUpdateAgeDays / open) : 0,
      topStatuses,
      priorityMix,
      atRisk,
      recentActivity,
    };
  }, [total, visibleIssues]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);
    params.set("searchMode", searchMode);
    params.set("scope", "issues");
    if (sort) params.set("sort", sort);
    params.set("page", "1");
    params.set("pageSize", "100");
    return params.toString();
  }, [priorityFilter, search, searchMode, sort, statusFilter]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed)) {
        setSavedViews(parsed.filter((item) => typeof item?.id === "string" && typeof item?.name === "string"));
      }
    } catch {
      window.localStorage.removeItem(SAVED_VIEWS_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    if (!timerStartedAtMs || !timerIssueId) {
      return;
    }
    const id = window.setInterval(() => {
      setTimerNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerIssueId, timerStartedAtMs]);

  useEffect(() => {
    setSelectedIssueIds((current) => current.filter((id) => allVisibleIssueIds.includes(id)));
  }, [allVisibleIssueIds]);

  useEffect(() => {
    if (!activeViewId) return;
    const active = savedViews.find((v) => v.id === activeViewId);
    if (!active) {
      setActiveViewId(null);
      return;
    }
    const stillMatch = matchesView(active, { statusFilter, priorityFilter, search, sort });
    if (!stillMatch) {
      setActiveViewId(null);
    }
  }, [activeViewId, priorityFilter, savedViews, search, sort, statusFilter]);

  async function loadSession() {
    const res = await fetch("/api/session/me", { cache: "no-store" });
    const data = await res.json();
    setUser(data.user ?? null);
  }

  async function loadBootstrapInfo() {
    const res = await fetch("/api/redmine/bootstrap", { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setBootstrapInfo(data);
  }

  async function loadAiStatus() {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch {
      // AI not available
      setAiStatus(null);
    }
  }

  async function loadAiSummaryCount() {
    try {
      const res = await fetch("/api/ai/summary-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAiSummaryCount(data.count ?? 0);
      }
    } catch {
      setAiSummaryCount(0);
    }
  }

  async function loadSyncStatus() {
    if (!user) return;
    const res = await fetch("/api/sync/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const state = (data.state ?? null) as SyncState;
      if (state && !state.lastError && data.latestJob?.error) {
        state.lastError = String(data.latestJob.error);
      }
      setSyncState(state);
    }
  }

  async function loadIssues() {
    if (!user) return;
    const res = await fetch(`/api/issues?${queryString}&pageSize=${fetchPageSize}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to load issues");
    }

    const data = await res.json();
    setIssues(data.items ?? []);
    setTotal(data.total ?? 0);
    setStatuses(data.filters?.statuses ?? []);
    setPriorities(uniqueStrings(data.filters?.priorities ?? []));
    setSearchSource(data.source ?? "local_cache");
    setPage(1); // Reset to page 1 on fresh data
  }

  async function loadActivities() {
    if (!user) return;
    const res = await fetch("/api/internal/activities", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const fetched = data.activities ?? [];
      setActivities(fetched);
      if (fetched.length > 0 && activityId === 0) {
        setActivityId(fetched[0].id);
      }
    }
  }

  function resetPage() {
    setPage(1);
  }

  async function loadFavorites() {
    try {
      const res = await fetch("/api/issues/favorites", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFavoriteIssueIds(data.favorites ?? []);
      }
    } catch {
      // Ignore errors
    }
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await loadIssues();
      await loadSyncStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSession(), loadBootstrapInfo(), loadAiStatus(), loadAiSummaryCount()]);
      } finally {
        setLoading(false);
      }
    })();


  }, []);

  useEffect(() => {
    if (!user) return;

    void refreshAll();
    void loadActivities();
    void loadFavorites();

    const id = setInterval(() => {
      void refreshAll();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
    // refreshAll/loadActivities intentionally depend on current query + user snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, user]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inTypingField = Boolean(
        target
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable),
      );

      if (event.key === "Escape") {
        if (showShortcutHelp) {
          setShowShortcutHelp(false);
          return;
        }
        if (selectedIssueId) {
          setSelectedIssueId(null);
        }
        return;
      }

      if (inTypingField) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        resetFilters();
        return;
      }

      if (event.key.toLowerCase() === "r" && !manualRefreshBusy) {
        event.preventDefault();
        void handleManualPull();
        return;
      }

      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        window.location.assign("/reports");
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        window.location.assign("/ops");
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShowShortcutHelp((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // keyboard handlers intentionally bind to latest reactive state snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualRefreshBusy, selectedIssueId, showShortcutHelp]);

  useEffect(() => {
    if (statuses.length === 0) return;
    if (bulkStatusId > 0) return;
    setBulkStatusId(statuses[0].id);
  }, [bulkStatusId, statuses]);

  useEffect(() => {
    setGithubRepo("");
    setGithubIssueNumber("");
    setGithubPrNumber("");
    setGithubUrl("");
    setGithubTitle("");
  }, [selectedIssueId]);

  async function connectRedmine(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/redmine/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Connection failed");
      }

      setUser(data.user);
      await refreshAll();
      await loadActivities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualPull() {
    setManualRefreshBusy(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch("/api/sync/manual-pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to start manual pull");
      }

      const jobId = data.jobId as string;
      let attempts = 0;
      while (attempts < 30) {
        const statusRes = await fetch("/api/sync/status", { cache: "no-store" });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSyncState(statusData.state ?? null);
          const latest = statusData.latestJob;
          if (latest?.id === jobId && ["success", "failed"].includes(latest.status)) {
            break;
          }
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await refreshAll();
      setInfoMessage("Manual full refresh completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Manual pull failed");
    } finally {
      setManualRefreshBusy(false);
    }
  }

  async function bootstrapFromEnv() {
    setBootstrapBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/redmine/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to bootstrap from environment");
      }
      setUser(data.user);
      await refreshAll();
      await loadActivities();
      await loadBootstrapInfo();
      setInfoMessage("Connected using .env configuration.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to bootstrap from environment");
    } finally {
      setBootstrapBusy(false);
    }
  }

  async function updateStatus(issue: Issue, nextStatusId: number) {
    const allowed = allowedStatusIdsByIssue[issue.redmineIssueId];
    if (allowed && allowed.length > 0 && !allowed.includes(nextStatusId)) {
      setError("Selected status is not allowed for this issue.");
      return;
    }

    const previous = [...issues];
    const nextStatus = statuses.find((s) => s.id === nextStatusId);
    setIssues((current) =>
      current.map((item) =>
        item.redmineIssueId === issue.redmineIssueId
          ? {
              ...item,
              statusId: nextStatusId,
              statusName: nextStatus?.name ?? item.statusName,
            }
          : item,
      ),
    );

    try {
      const res = await fetch(`/api/issues/${issue.redmineIssueId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: nextStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Status update failed");
      }

      await refreshAll();
    } catch (e) {
      setIssues(previous);
      setError(e instanceof Error ? e.message : "Status update failed");
    }
  }

  const handleSort = (column: string) => {
    const sortMap: Record<string, [string, string]> = {
      priority: ["priority", "updated_desc"],
      due: ["due_date", "updated_desc"],
      updated: ["updated_desc", "updated_asc"],
    };

    const options = sortMap[column];
    if (!options) return;

    const [defaultSort, alternateSort] = options;
    if (sort === defaultSort) {
      setSort(alternateSort);
    } else if (sort === alternateSort && column === "updated") {
      setSort(defaultSort);
    } else {
      setSort(defaultSort);
    }
  };

  const getSortIndicator = (column: string): string => {
    if (column === "priority" && sort === "priority") return " ▲";
    if (column === "due" && sort === "due_date") return " ▲";
    if (column === "updated" && sort === "updated_desc") return " ▼";
    if (column === "updated" && sort === "updated_asc") return " ▲";
    return "";
  };

  async function updateBulkStatus() {
    if (selectedIssueIds.length === 0 || bulkStatusId <= 0) {
      return;
    }

    setBulkUpdating(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch("/api/issues/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: selectedIssueIds, statusId: bulkStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk status update failed");
      }

      const failedCount = Number(data.failedCount ?? 0);
      const updatedCount = Number(data.updatedCount ?? 0);
      if (failedCount > 0) {
        setError(`Updated ${updatedCount} issue(s), ${failedCount} failed. Open browser console for details.`);
        // keep a compact breadcrumb for deeper troubleshooting.
        console.error("Bulk update failures", data.failures ?? []);
      } else {
        setInfoMessage(`Updated ${updatedCount} issue(s).`);
      }

      await refreshAll();
      setSelectedIssueIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk status update failed");
    } finally {
      setBulkUpdating(false);
    }
  }

  async function loadAllowedStatuses(issueId: number) {
    if (allowedStatusIdsByIssue[issueId]) {
      return;
    }

    const localIssue = issues.find((item) => item.redmineIssueId === issueId);
    const fromIssue = localIssue?.allowedStatuses?.map((s) => s.id) ?? [];
    if (fromIssue.length > 0) {
      setAllowedStatusIdsByIssue((current) => ({
        ...current,
        [issueId]: fromIssue,
      }));
      return;
    }

    const res = await fetch(`/api/issues/${issueId}/status`, { cache: "no-store" });
    if (!res.ok) {
      return;
    }

    const data = await res.json();
    const ids = Array.isArray(data.allowedStatusIds) ? data.allowedStatusIds : [];
    setAllowedStatusIdsByIssue((current) => ({
      ...current,
      [issueId]: ids,
    }));
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue || !comment.trim()) return;

    const toPost = comment;
    setComment("");

    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: toPost }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Comment failed");
      }
      await refreshAll();
    } catch (e) {
      setComment(toPost);
      setError(e instanceof Error ? e.message : "Comment failed");
    }
  }

  async function submitTimelog(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue) return;

    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/timelog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: Number(hours),
          activityId,
          comment: timeComment,
          spentOn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Timelog failed");
      }
      setTimeComment("");
      await refreshAll();
      setInfoMessage("Time entry added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timelog failed");
    }
  }

  async function submitGithubLink(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue) return;

    setGithubBusy(true);
    setError(null);
    try {
      const issueNo = githubIssueNumber.trim();
      const prNo = githubPrNumber.trim();
      const payload = {
        repositoryFullName: githubRepo.trim(),
        githubIssueNumber: issueNo ? Number(issueNo) : undefined,
        githubPrNumber: prNo ? Number(prNo) : undefined,
        url: githubUrl.trim() || undefined,
        title: githubTitle.trim() || undefined,
      };

      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/github-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to link GitHub reference");
      }

      setGithubIssueNumber("");
      setGithubPrNumber("");
      setGithubUrl("");
      setGithubTitle("");
      await refreshAll();
      setInfoMessage("GitHub link added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to link GitHub reference");
    } finally {
      setGithubBusy(false);
    }
  }

  async function deleteGithubLink(linkId: string) {
    if (!selectedIssue) return;

    setGithubBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/github-links/${linkId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to remove GitHub link");
      }
      await refreshAll();
      setInfoMessage("GitHub link removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove GitHub link");
    } finally {
      setGithubBusy(false);
    }
  }

  async function submitAttachment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue || !attachmentFile) return;

    setAttachmentBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", attachmentFile);
      if (attachmentDescription.trim()) {
        form.set("description", attachmentDescription.trim());
      }

      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/attachments`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to upload attachment");
      }

      setAttachmentFile(null);
      setAttachmentDescription("");
      await refreshAll();
      setInfoMessage("Attachment uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload attachment");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function submitRelation(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue) return;

    const issueToId = Number(relationIssueToId);
    if (!Number.isInteger(issueToId) || issueToId <= 0) {
      setError("Enter a valid related issue ID.");
      return;
    }

    setRelationBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueToId,
          relationType,
          delay: relationDelay.trim() ? Number(relationDelay) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to add relation");
      }

      setRelationIssueToId("");
      setRelationDelay("");
      await refreshAll();
      setInfoMessage("Relation added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add relation");
    } finally {
      setRelationBusy(false);
    }
  }

  async function deleteRelation(relationId: number) {
    if (!selectedIssue) return;
    setRelationBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/relations/${relationId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to remove relation");
      }
      await refreshAll();
      setInfoMessage("Relation removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove relation");
    } finally {
      setRelationBusy(false);
    }
  }

  function startTimerForIssue(issueId: number) {
    setTimerIssueId(issueId);
    const now = Date.now();
    setTimerStartedAtMs(now);
    setTimerNowMs(now);
    setInfoMessage(`Started timer for issue #${issueId}.`);
  }

  function stopTimerAndApply() {
    if (!selectedIssue || timerIssueId !== selectedIssue.redmineIssueId || !timerStartedAtMs) {
      return;
    }
    const elapsedHours = Math.max(0.1, (Date.now() - timerStartedAtMs) / (60 * 60 * 1000));
    setHours(elapsedHours.toFixed(1));
    setTimerIssueId(null);
    setTimerStartedAtMs(null);
    setTimerNowMs(Date.now());
    setInfoMessage(`Timer stopped. Hours prefilled to ${elapsedHours.toFixed(1)}.`);
  }

  function applySavedView(view: SavedView) {
    setStatusFilter(view.statusFilter);
    setPriorityFilter(view.priorityFilter);
    setSearch(view.search);
    setSort(view.sort);
    setActiveViewId(view.id);
  }

  function saveCurrentView() {
    const name = viewDraftName.trim() || `View ${savedViews.length + 1}`;
    const existing = savedViews.find((v) => v.name.toLowerCase() === name.toLowerCase());
    const nextView: SavedView = {
      id: existing?.id ?? `${Date.now()}`,
      name,
      statusFilter,
      priorityFilter,
      search,
      sort,
    };

    if (existing) {
      setSavedViews((current) => current.map((v) => (v.id === existing.id ? nextView : v)));
      setInfoMessage(`Saved changes to view "${name}".`);
      setActiveViewId(existing.id);
    } else {
      setSavedViews((current) => [nextView, ...current].slice(0, 12));
      setInfoMessage(`Saved view "${name}".`);
      setActiveViewId(nextView.id);
    }

    setViewDraftName("");
  }

  function deleteSavedView(viewId: string) {
    const target = savedViews.find((view) => view.id === viewId);
    setSavedViews((current) => current.filter((view) => view.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
    }
    if (target) {
      setInfoMessage(`Removed view "${target.name}".`);
    }
  }

  function toggleIssueSelection(issueId: number) {
    setSelectedIssueIds((current) =>
      current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedIssueIds((current) => {
      if (allVisibleIssueIds.length === 0) {
        return [];
      }
      if (selectedAllVisible) {
        return current.filter((id) => !allVisibleIssueIds.includes(id));
      }
      const combined = new Set([...current, ...allVisibleIssueIds]);
      return Array.from(combined);
    });
  }

  function resetFilters() {
    setStatusFilter("");
    setPriorityFilter("");
    setSearch("");
    setSearchMode("local");
    setSort("updated_desc");
    setSelectedProject(null);
    setShowFavoritesOnly(false);
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
    setActiveViewId(null);
  }

  if (!user) {
    return (
      <main className="dashboard auth-shell">
        <section className="card auth-panel">
          <div className="auth-grid">
            <div>
              <p className="kicker">Redmine Operations</p>
              <h1>Mission Control Dashboard</h1>
              <p className="muted">
                Connect your Redmine account and run issue triage, status transitions, comments, and
                time logging from one place.
              </p>
            </div>
            <form className="form" onSubmit={connectRedmine}>
              <label>
                Base URL
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://redmine.example.com"
                  required
                />
              </label>
              <label>
                API Key
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="your-redmine-api-key"
                  required
                />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? "Connecting..." : "Launch Dashboard"}
              </button>
              {bootstrapInfo?.configured && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={bootstrapFromEnv}
                  disabled={bootstrapBusy || !bootstrapInfo.canBootstrap}
                >
                  {bootstrapBusy ? "Using .env..." : "Use .env Configuration"}
                </button>
              )}
              {bootstrapInfo?.configured && !bootstrapInfo.canBootstrap && (
                <p className="muted">
                  .env bootstrap is available only on first run (active credentials:{" "}
                  {bootstrapInfo.activeCredentials}).
                </p>
              )}
            </form>
          </div>
          {error && <p className="error-banner">{error}</p>}
        </section>
      </main>
    );
  }

  const syncStateTone = syncTone(syncState?.lastSyncStatus);
  const timerRunningOnSelected = selectedIssue && timerIssueId === selectedIssue.redmineIssueId && Boolean(timerStartedAtMs);
  const lastSyncAt = latestSyncTimestamp(syncState);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div className="hero-heading">
            <p className="kicker">Redmine Control Room</p>
            <h1 className="hero-title">Nasc Redmine Command Center (NRCC)</h1>
            <p className="muted">
              Signed in as <strong>{user.displayName}</strong> ({user.username})
            </p>
          </div>
          <div className="hero-status-rail">
            <div className={`sync-pill sync-${syncStateTone}`}>
              Sync: {syncState?.lastSyncStatus ?? "idle"}
              {lastSyncAt
                ? ` • ${new Date(lastSyncAt).toLocaleString()}`
                : " • Waiting for first sync"}
            </div>
            {aiStatus?.available && (
              <div className="ai-status-pill">
                🤖 AI: {aiStatus.usingFallback ? "Fallback" : "Cloud"}
              </div>
            )}
            <div className="notif-shell">
              <NotificationsPanel />
            </div>
          </div>
        </div>
        {syncState?.lastSyncStatus === "failed" && (
          <p className="sync-error-inline">
            Last sync error: {summarizeSyncError(syncState.lastError)}
          </p>
        )}

        <div className="hero-actions">
          <button onClick={handleManualPull} disabled={manualRefreshBusy}>
            {manualRefreshBusy ? "Refreshing..." : "Force Refresh"}
          </button>
          <Link href="/reports" className="primary-link nav-link">
            Open Reports
          </Link>
          <Link href="/ai-summaries" className="primary-link nav-link">
            AI Summaries
          </Link>
          <Link href="/ops" className="primary-link nav-link">
            Sync Ops
          </Link>
          <Link href="/heimdall" className="primary-link nav-link">
            Heimdall
          </Link>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Reset Filters
          </button>
          <button className="secondary-button" type="button" onClick={() => setShowShortcutHelp(true)}>
            Shortcuts
          </button>
        </div>

        <section className="metrics-grid">
          <article className="card metric-card metric-primary">
            <p className="metric-label">Visible / Total</p>
            <p className="metric-value">
              {summary.totalVisible} <span>/ {summary.total}</span>
            </p>
            <div className="progress-track">
              <span
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.round((summary.totalVisible / Math.max(1, summary.total)) * 100))}%` }}
              />
            </div>
            <div className="metric-signal-row">
              <span>Due Today: {summary.dueToday}</span>
              <span>Avg Since Update: {summary.avgOpenAgeDays}d</span>
            </div>
          </article>
          <article className="card metric-card metric-open">
            <p className="metric-label">Open</p>
            <p className="metric-value">{summary.open}</p>
            <p className="metric-foot">In progress: {summary.inProgress}</p>
          </article>
          <article className="card metric-card metric-risk">
            <p className="metric-label">Risk Bucket</p>
            <p className="metric-value">{summary.overdue}</p>
            <p className="metric-foot">Overdue issues • Due soon: {summary.dueSoon}</p>
          </article>
          <article className="card metric-card metric-health">
            <p className="metric-label">Delivery Health</p>
            <p className="metric-value">{summary.completion}%</p>
            <p className="metric-foot">Done: {summary.done} • Avg done ratio: {summary.avgDoneRatio}%</p>
          </article>
          <article className="card metric-card metric-blocked">
            <p className="metric-label">Blocked</p>
            <p className="metric-value">{summary.blocked}</p>
            <p className="metric-foot">Status contains blocked/hold/waiting</p>
          </article>
          <article className="card metric-card metric-stale">
            <p className="metric-label">Stale Queue</p>
            <p className="metric-value">{summary.stale}</p>
            <p className="metric-foot">No visible activity in 3+ days • Avg since activity: {summary.avgOpenAgeDays}d</p>
          </article>
          <article className="card metric-card metric-ai-insights">
            <p className="metric-label">AI Insights</p>
            <p className="metric-value">{aiSummaryCount}</p>
            <p className="metric-foot">
              {aiSummaryCount === 0
                ? "No available AI insights. Check again later!"
                : aiSummaryCount === 1
                  ? "1 AI insight generated"
                  : `${aiSummaryCount} AI insights generated`}
            </p>
          </article>
        </section>
      </header>

      <section className="card filters-panel">
        <div className="filters-grid home-filters-grid">
          <label className="filter-field">
            Status
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}>
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            Priority
            <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); resetPage(); }}>
              <option value="">All Priorities</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated_desc">Activity (Newest)</option>
              <option value="updated_asc">Activity (Oldest)</option>
              <option value="priority">Priority</option>
              <option value="due_date">Due Date</option>
            </select>
          </label>

          <label className="filter-field search-field">
            Search
            <input
              ref={searchInputRef}
              placeholder="Subject, description, assignee"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </label>

          <label className="filter-field">
            Search Source
            <select value={searchMode} onChange={(e) => setSearchMode((e.target.value as "local" | "hybrid"))}>
              <option value="local">Local Cache</option>
              <option value="hybrid">Hybrid (Redmine + Cache)</option>
            </select>
            <span className="muted">Serving from: {searchSource === "local_cache" ? "Local cache" : "Hybrid"}</span>
          </label>
        </div>

        <div className="saved-view-row">
          <label className="view-name-field">
            Save Current Filter Set
            <input
              placeholder="e.g. Blocked + High Priority"
              value={viewDraftName}
              onChange={(e) => setViewDraftName(e.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" onClick={saveCurrentView}>
            Save View
          </button>
          <div className="chip-row saved-view-chips">
            {savedViews.length === 0 && <span className="muted">No saved views yet.</span>}
            {savedViews.map((view) => (
              <div key={view.id} className={`saved-view-pill ${activeViewId === view.id ? "active" : ""}`}>
                <button type="button" className="saved-view-apply" onClick={() => applySavedView(view)}>
                  {view.name}
                </button>
                <button type="button" className="saved-view-delete" onClick={() => deleteSavedView(view.id)} aria-label={`Delete ${view.name}`}>
                  x
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="home-filters-footer">
          <button
            type="button"
            className={`ai-toggle ${aiSearchOpen ? "active" : ""}`}
            onClick={() => setAiSearchOpen(!aiSearchOpen)}
            disabled={!aiStatus?.available}
          >
            🤖 AI Search {aiStatus?.available ? "" : "(offline)"}
          </button>
        </div>
      </section>

      <section className="insights-grid">
        <article className="card">
          <h2>Status Mix</h2>
          <p className="muted">Click a status to filter quickly.</p>
          <div className="chip-row">
            {summary.topStatuses.length === 0 && <span className="muted">No status data yet.</span>}
            {summary.topStatuses.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`status-chip ${statusFilter === name ? "active" : ""}`}
                onClick={() => setStatusFilter(statusFilter === name ? "" : name)}
              >
                {name} <span>{count}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Priority Mix</h2>
          <div className="bars-list">
            {summary.priorityMix.length === 0 && <span className="muted">No priority data yet.</span>}
            {summary.priorityMix.map(([name, count]) => (
              <div key={name} className="bar-row">
                <div className="bar-label-row">
                  <span>{name}</span>
                  <strong>{count}</strong>
                </div>
                <div className="bar-track">
                  <span className="bar-fill priority" style={{ width: `${Math.round((count / Math.max(1, summary.totalVisible)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {error && <p className="error-banner">{error}</p>}
      {infoMessage && <p className="info-banner">{infoMessage}</p>}

      {aiSearchOpen && aiStatus?.available && (
        <section className="card filters-panel">
          <h3>🔍 AI-Powered Search</h3>
          <AiSearchBar />
        </section>
      )}

      <section className="collapsible-stack">
        <article className="card">
          <div className="collapsible-head">
            <div>
              <h2>Ops Alerts</h2>
              <p className="muted">Highest risk issues based on overdue, blocked, and stale signals.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setOpsAlertsOpen((current) => !current)}>
              {opsAlertsOpen ? "Collapse" : "Expand"}
            </button>
          </div>

          {opsAlertsOpen ? (
            <div className="alert-list">
              {summary.atRisk.length === 0 && <p className="muted">No active risk alerts.</p>}
              {summary.atRisk.map(({ issue, reason }) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`alert-row ${reason.includes("overdue") ? "tone-critical" : reason.includes("blocked") ? "tone-warning" : "tone-stale"}`}
                  onMouseEnter={() => prefetchIssueDetail(issue.redmineIssueId)}
                  onFocus={() => prefetchIssueDetail(issue.redmineIssueId)}
                  onClick={() => {
                    openIssueInNewTab(issue.redmineIssueId);
                  }}
                >
                  <span>
                    #{issue.redmineIssueId} {issue.subject}
                  </span>
                  <span>{reason}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted collapsible-meta">{summary.atRisk.length} alert item(s).</p>
          )}
        </article>

        <article className="card activity-card">
          <div className="collapsible-head">
            <div>
              <h2>Recent Activity Feed</h2>
              <p className="muted">Last {summary.recentActivity.length} events from updates, comments, and timelogs.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setActivityFeedOpen((current) => !current)}>
              {activityFeedOpen ? "Collapse" : "Expand"}
            </button>
          </div>

          {activityFeedOpen ? (
            <div className="activity-feed">
              {summary.recentActivity.map((event, idx) => (
                <button
                  key={`${event.issueId}-${event.timestamp}-${idx}`}
                  type="button"
                  className={`activity-row ${event.detail.includes("logged") ? "tone-time" : event.detail.includes("commented") ? "tone-comment" : "tone-update"}`}
                  onMouseEnter={() => prefetchIssueDetail(event.issueId)}
                  onFocus={() => prefetchIssueDetail(event.issueId)}
                  onClick={() => {
                    openIssueInNewTab(event.issueId);
                  }}
                >
                  <span>
                    #{event.issueId} {event.issueSubject}
                  </span>
                  <span>{event.detail}</span>
                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted collapsible-meta">Hidden feed. {summary.recentActivity.length} event(s) available.</p>
          )}
        </article>

        {/* Analytics Dashboard */}
        <article className="card charts-card">
          <div className="collapsible-head">
            <div>
              <h2>📊 Analytics Dashboard</h2>
              <p className="muted">Issue trends and workload distribution</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setShowCharts((c) => !c)}>
              {showCharts ? "Collapse" : "Expand"}
            </button>
          </div>
          {showCharts && visibleIssues.length > 0 && (
            <DashboardWidgets stats={calculateStats(visibleIssues)} />
          )}
        </article>

        <article className="card issues-panel">
          <div className="collapsible-head">
            <div>
              <h2>Issue Queue</h2>
              <p className="muted">{loading ? "Refreshing..." : `${visibleIssues.length} loaded`}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setIssueQueueOpen((current) => !current)}>
              {issueQueueOpen ? "Collapse" : "Expand"}
            </button>
          </div>

          {issueQueueOpen ? (
            <>
              <div className="bulk-toolbar">
                <p className="muted">
                  Selected: <strong>{selectedIssueIds.length}</strong>
                  {summary.dueToday > 0 ? ` • Due today: ${summary.dueToday}` : ""}
                </p>
                <div className="bulk-controls">
                  <label className="inline-field">
                    Bulk Status
                    <select value={bulkStatusId} onChange={(e) => setBulkStatusId(Number(e.target.value))}>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={updateBulkStatus}
                    disabled={selectedIssueIds.length === 0 || bulkUpdating || bulkStatusId <= 0}
                  >
                    {bulkUpdating ? "Applying..." : "Apply to Selected"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setSelectedIssueIds([])}>
                    Clear Selection
                  </button>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="filters-bar">
                <ProjectFilter
                  issues={issues}
                  selectedProject={selectedProject}
                  onChange={(project) => {
                    setSelectedProject(project);
                    resetPage();
                  }}
                />
                <AdvancedFilters
                  filters={advancedFilters}
                  onChange={(nextFilters) => {
                    setAdvancedFilters(nextFilters);
                    resetPage();
                  }}
                  statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
                  priorities={priorityOptions}
                  onClear={() => {
                    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
                    resetPage();
                  }}
                />
                <button
                  type="button"
                  className={`favorite-filter ${showFavoritesOnly ? "active" : ""}`}
                  onClick={() => {
                    setShowFavoritesOnly(!showFavoritesOnly);
                    resetPage();
                  }}
                >
                  {showFavoritesOnly ? "★ Favorites" : "☆ Favorites"}
                </button>
                <ExportButton issues={visibleIssues} format="csv" />
                <ExportButton issues={visibleIssues} format="print" />
              </div>

              <div className="issues-table-wrap">
                <table className="issues-table">
                  <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedAllVisible}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all visible issues"
                      />
                    </th>
                    <th>ID</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort("priority")}
                      style={{ cursor: "pointer" }}
                      title="Sort by priority"
                    >
                      Priority{getSortIndicator("priority")}
                    </th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort("due")}
                      style={{ cursor: "pointer" }}
                      title="Sort by due date"
                    >
                      Due{getSortIndicator("due")}
                    </th>
                    <th>Progress</th>
                    <th
                      className="sortable-header"
                      onClick={() => handleSort("updated")}
                      style={{ cursor: "pointer" }}
                      title="Sort by update time"
                    >
                      Activity{getSortIndicator("updated")}
                    </th>
                  </tr>
                  </thead>
                  <tbody>
                  {(() => {
                    const filtered = visibleIssues;
                    const start = (page - 1) * pageSize;
                    const paged = filtered.slice(start, start + pageSize);
                    return paged.map((issue) => {
                    const urgency = issueUrgency(issue);
                    const allowedStatusIds = allowedStatusIdsByIssue[issue.redmineIssueId];
                    const selectableStatuses =
                      allowedStatusIds && allowedStatusIds.length > 0
                        ? statuses.filter((s) => allowedStatusIds.includes(s.id))
                        : statuses;

                    return (
                      <tr
                        key={issue.id}
                        className={`issue-row ${selectedIssueId === issue.redmineIssueId ? "selected" : ""}`}
                        onMouseEnter={() => prefetchIssueDetail(issue.redmineIssueId)}
                        onClick={() => {
                          openIssueInNewTab(issue.redmineIssueId);
                        }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIssueIds.includes(issue.redmineIssueId)}
                            onChange={() => toggleIssueSelection(issue.redmineIssueId)}
                            aria-label={`Select issue ${issue.redmineIssueId}`}
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {redmineIssueUrl(issue) ? (
                            <a
                              className="redmine-issue-link compact"
                              href={redmineIssueUrl(issue) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              #{issue.redmineIssueId}
                            </a>
                          ) : (
                            <span>#{issue.redmineIssueId}</span>
                          )}
                        </td>
                        <td>
                          <div className="subject-cell">
                            <p>{issue.subject}</p>
                            {issue.githubLinks.length > 0 && (
                              <span className="subject-meta">GH: {issue.githubLinks.length} link(s)</span>
                            )}
                            {issue.attachments.length > 0 && (
                              <span className="subject-meta">Attachments: {issue.attachments.length}</span>
                            )}
                            {issue.relations.length > 0 && (
                              <span className="subject-meta">Relations: {issue.relations.length}</span>
                            )}
                            <span className={`urgency-pill ${urgency}`}>{urgency}</span>
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="status-select"
                            value={issue.statusId}
                            onChange={(e) => updateStatus(issue, Number(e.target.value))}
                            onFocus={() => {
                              void loadAllowedStatuses(issue.redmineIssueId);
                            }}
                          >
                            {selectableStatuses.map((status) => (
                              <option key={status.id} value={status.id}>
                                {status.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{issue.priority ?? "-"}</td>
                        <td>{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</td>
                        <td>{issue.doneRatio ?? 0}%</td>
                        <td>{new Date(latestIssueActivityTimestamp(issue)).toLocaleString()}</td>
                      </tr>
                    );
                  });
                })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {(() => {
                const filtered = visibleIssues;
                const filteredTotal = filtered.length;
                const maxPage = Math.max(1, Math.ceil(filteredTotal / pageSize));
                const safePage = Math.min(page, maxPage);
                if (filteredTotal <= pageSize) return null;
                return (
                <div className="pagination-bar">
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { setPage(1); }}
                    disabled={safePage === 1}
                  >
                    ««
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { setPage(p => Math.max(1, p - 1)); }}
                    disabled={safePage === 1}
                  >
                    «
                  </button>
                  <span className="pagination-info">
                    Page <strong>{safePage}</strong> of <strong>{maxPage}</strong>
                    {" · "}Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredTotal)} of {filteredTotal}
                    {filteredTotal < total ? ` (filtered from ${total.toLocaleString()})` : ""}
                  </span>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { setPage(p => p + 1); }}
                    disabled={safePage >= maxPage}
                  >
                    »
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { setPage(maxPage); }}
                    disabled={safePage >= maxPage}
                  >
                    »»
                  </button>
                </div>
                );
              })()}
            </>
          ) : (
            <p className="muted collapsible-meta">
              Queue hidden. {visibleIssues.length} issue(s) loaded, {selectedIssueIds.length} selected.
            </p>
          )}
        </article>
      </section>

      {selectedIssue && (
        <div className="issue-modal-backdrop" onClick={() => setSelectedIssueId(null)}>
          <aside className="card issue-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div className="issue-title-line compact-title">
                  {redmineIssueUrl(selectedIssue) ? (
                    <a
                      className="redmine-issue-link"
                      href={redmineIssueUrl(selectedIssue) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{selectedIssue.redmineIssueId}
                    </a>
                  ) : (
                    <span className="redmine-issue-link muted">#{selectedIssue.redmineIssueId}</span>
                  )}
                  <h2>{selectedIssue.subject}</h2>
                </div>
                <p className="issue-meta">
                  {selectedIssue.projectName ?? "No Project"} • {selectedIssue.statusName} • {selectedIssue.priority ?? "No Priority"}
                </p>
                {redmineIssueUrl(selectedIssue) && (
                  <p className="external-issue-row">
                    Redmine source:
                    <a href={redmineIssueUrl(selectedIssue) ?? undefined} target="_blank" rel="noopener noreferrer">
                      {redmineIssueUrl(selectedIssue)}
                    </a>
                  </p>
                )}
                {selectedIssue.children.length > 0 && (
                  <p className="muted">Children: {selectedIssue.children.map((c) => `#${c.id}`).join(", ")}</p>
                )}
              </div>
              <button className="secondary-button" type="button" onClick={() => setSelectedIssueId(null)}>
                Close
              </button>
            </div>

            <section className="detail-section">
              <h3>GitHub Links</h3>
              <form className="form" onSubmit={submitGithubLink}>
                <label>
                  Repository (`owner/repo`)
                  <input
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="acme/platform"
                    required
                  />
                </label>
                <label>
                  GitHub Issue #
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={githubIssueNumber}
                    onChange={(e) => setGithubIssueNumber(e.target.value)}
                    placeholder="123"
                  />
                </label>
                <label>
                  GitHub PR #
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={githubPrNumber}
                    onChange={(e) => setGithubPrNumber(e.target.value)}
                    placeholder="456"
                  />
                </label>
                <label>
                  Direct URL (optional)
                  <input
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/acme/platform/issues/123"
                  />
                </label>
                <label>
                  Title (optional)
                  <input
                    value={githubTitle}
                    onChange={(e) => setGithubTitle(e.target.value)}
                    placeholder="Investigate API timeout"
                  />
                </label>
                <button type="submit" disabled={githubBusy}>
                  {githubBusy ? "Linking..." : "Add GitHub Link"}
                </button>
              </form>

              <div className="timeline">
                {selectedIssue.githubLinks.length === 0 && <p className="muted">No GitHub links yet.</p>}
                {selectedIssue.githubLinks.map((link) => (
                  <div key={link.id} className="timeline-item">
                    <div className="entry-head">
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.title
                          ?? (link.githubPrNumber
                            ? `${link.repositoryFullName}#PR-${link.githubPrNumber}`
                            : link.githubIssueNumber
                              ? `${link.repositoryFullName}#${link.githubIssueNumber}`
                              : link.repositoryFullName)}
                      </a>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void deleteGithubLink(link.id)}
                        disabled={githubBusy}
                      >
                        Remove
                      </button>
                    </div>
                    <p className="muted entry-meta">
                      {link.repositoryFullName}
                      {link.githubIssueNumber ? ` • Issue #${link.githubIssueNumber}` : ""}
                      {link.githubPrNumber ? ` • PR #${link.githubPrNumber}` : ""}
                    </p>
                    <p className="muted">{link.url}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h3>Attachments</h3>
              <form className="form" onSubmit={submitAttachment}>
                <label>
                  File
                  <input
                    type="file"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label>
                  Description (optional)
                  <input
                    value={attachmentDescription}
                    onChange={(e) => setAttachmentDescription(e.target.value)}
                    placeholder="Optional note"
                  />
                </label>
                <button type="submit" disabled={attachmentBusy || !attachmentFile}>
                  {attachmentBusy ? "Uploading..." : "Upload Attachment"}
                </button>
              </form>

              <div className="timeline">
                {selectedIssue.attachments.length === 0 && <p className="muted">No attachments yet.</p>}
                {selectedIssue.attachments.map((attachment) => (
                  <div key={attachment.id} className="timeline-item">
                    <div className="entry-head">
                      <a href={attachmentUrl(selectedIssue.redmineIssueId, attachment.redmineAttachmentId)} target="_blank" rel="noreferrer">
                        {attachment.filename}
                      </a>
                      <span className="muted">{(attachment.filesize / 1024).toFixed(1)} KB</span>
                    </div>
                    {isImageAttachment(attachment) && (
                      <a
                        href={attachmentUrl(selectedIssue.redmineIssueId, attachment.redmineAttachmentId)}
                        target="_blank"
                        rel="noreferrer"
                        className="attachment-preview-link"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="attachment-preview-image"
                          src={attachmentUrl(selectedIssue.redmineIssueId, attachment.redmineAttachmentId)}
                          alt={attachment.filename}
                          loading="lazy"
                          style={{ maxWidth: "520px", height: "auto" }}
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                          }}
                        />
                      </a>
                    )}
                    {isPdfAttachment(attachment) && (
                      <iframe
                        className="attachment-preview-pdf"
                        src={attachmentUrl(selectedIssue.redmineIssueId, attachment.redmineAttachmentId)}
                        title={`Preview ${attachment.filename}`}
                      />
                    )}
                    <p className="muted entry-meta">
                      {attachment.author ?? "Unknown author"}
                      {attachment.createdOnRemote ? ` • ${new Date(attachment.createdOnRemote).toLocaleString()}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h3>Relations</h3>
              <form className="form" onSubmit={submitRelation}>
                <label>
                  Issue #
                  <input
                    type="number"
                    min="1"
                    value={relationIssueToId}
                    onChange={(e) => setRelationIssueToId(e.target.value)}
                    placeholder="1234"
                    required
                  />
                </label>
                <label>
                  Type
                  <select value={relationType} onChange={(e) => setRelationType(e.target.value)}>
                    <option value="relates">relates</option>
                    <option value="duplicated">duplicated</option>
                    <option value="blocks">blocks</option>
                    <option value="blocked">blocked</option>
                    <option value="precedes">precedes</option>
                    <option value="follows">follows</option>
                    <option value="duplicates">duplicates</option>
                    <option value="copied_to">copied_to</option>
                    <option value="copied_from">copied_from</option>
                  </select>
                </label>
                <label>
                  Delay (optional)
                  <input
                    type="number"
                    min="0"
                    value={relationDelay}
                    onChange={(e) => setRelationDelay(e.target.value)}
                    placeholder="days"
                  />
                </label>
                <button type="submit" disabled={relationBusy}>
                  {relationBusy ? "Saving..." : "Add Relation"}
                </button>
              </form>

              <div className="timeline">
                {selectedIssue.relations.length === 0 && <p className="muted">No relations yet.</p>}
                {selectedIssue.relations.map((relation) => (
                  <div key={relation.id} className="timeline-item">
                    <div className="entry-head">
                      <p>
                        <strong>{relation.relationType}</strong> #{relation.targetIssueId}
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void deleteRelation(relation.redmineRelationId)}
                        disabled={relationBusy}
                      >
                        Remove
                      </button>
                    </div>
                    {relation.delay !== null && <p className="muted">Delay: {relation.delay} day(s)</p>}
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h3>Description</h3>
              {selectedIssue.description ? (
                <MarkdownBlock
                  content={selectedIssue.description}
                  attachments={selectedIssue.attachments}
                  issueId={selectedIssue.redmineIssueId}
                />
              ) : (
                <p className="muted">No description.</p>
              )}
            </section>

            {aiStatus?.available && (
              <AiIssueActions issueId={selectedIssue.id} />
            )}

            <section className="detail-section">
              <h3>Comments</h3>
              <form className="form" onSubmit={submitComment}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share an update"
                  rows={3}
                />
                <button type="submit">Post Comment</button>
              </form>
              <div className="timeline">
                {selectedIssue.journals.every((journal) => !journal.notes?.trim()) && <p className="muted">No comments yet.</p>}
                {selectedIssue.journals.filter((journal) => Boolean(journal.notes?.trim())).map((j) => (
                  <div key={j.id} className="timeline-item">
                    <p className="muted">
                      <strong>{j.author ?? "Unknown"}</strong> • {new Date(j.createdOnRemote).toLocaleString()}
                    </p>
                    <MarkdownBlock
                      content={j.notes ?? ""}
                      attachments={selectedIssue.attachments}
                      issueId={selectedIssue.redmineIssueId}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="detail-section">
              <h3>Time Logs</h3>

              <div className="timer-row">
                {!timerRunningOnSelected && (
                  <button type="button" className="secondary-button" onClick={() => startTimerForIssue(selectedIssue.redmineIssueId)}>
                    Start Timer
                  </button>
                )}
                {timerRunningOnSelected && (
                  <>
                    <span className="timer-pill">Running: {formatDurationFromMs(timerElapsedMs)}</span>
                    <button type="button" className="secondary-button" onClick={stopTimerAndApply}>
                      Stop and Fill Hours
                    </button>
                  </>
                )}
                {timerIssueId && timerIssueId !== selectedIssue.redmineIssueId && (
                  <span className="muted">Timer is currently running on issue #{timerIssueId}.</span>
                )}
                <div className="quick-hours">
                  {[0.5, 1, 2, 4].map((value) => (
                    <button key={value} type="button" className="secondary-button" onClick={() => setHours(value.toFixed(1))}>
                      {value}h
                    </button>
                  ))}
                </div>
              </div>

              <form className="form" onSubmit={submitTimelog}>
                <label>
                  Hours
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </label>
                <label>
                  Activity
                  <select value={activityId} onChange={(e) => setActivityId(Number(e.target.value))}>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
                </label>
                <label>
                  Comment
                  <textarea
                    value={timeComment}
                    onChange={(e) => setTimeComment(e.target.value)}
                    placeholder="Summarize the work"
                    rows={2}
                  />
                </label>
                <button type="submit">Add Time Log</button>
              </form>

              <div className="timeline">
                {selectedIssue.timeEntries.length === 0 && <p className="muted">No time entries yet.</p>}
                {selectedIssue.timeEntries.map((t) => (
                  <div key={t.id} className="timeline-item">
                    <div className="entry-head">
                      <p className="muted">
                        <strong>{t.hours}h</strong> • {new Date(t.spentOn).toLocaleDateString()}
                      </p>
                      <span className={`entry-source ${t.redmineTimeEntryId ? "synced" : "local"}`}>
                        {t.redmineTimeEntryId ? "Synced from Redmine" : "Local entry"}
                      </span>
                    </div>
                    <p className="muted entry-meta">
                      {t.authorName ?? "Unknown author"}
                      {t.activityName ? ` • ${t.activityName}` : ""}
                    </p>
                    {t.comments ? (
                      <MarkdownBlock
                        content={t.comments}
                        attachments={selectedIssue.attachments}
                        issueId={selectedIssue.redmineIssueId}
                      />
                    ) : <p>(no comment)</p>}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}

      {showShortcutHelp && (
        <ShortcutHelp isOpen={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} />
      )}
    </main>
  );
}
