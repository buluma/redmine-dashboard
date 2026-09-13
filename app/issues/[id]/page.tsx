"use client";

import { AllowedStatusView, isLocalOnlyIssue } from "@/src/lib/issue-shape";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";
import { normalizeRedmineText } from "@/src/lib/redmine-text-format";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { ChatFab } from "@/src/components/ai/ChatFab";
import { QuickActionsPanel } from "@/src/components/QuickActionsPanel";
import { useOfflineAction } from "@/src/hooks/useOfflineAction";
import { useInternalNotes } from "@/src/hooks/useInternalNotes";
import { AttachmentsSection } from "@/src/components/issue-detail/AttachmentsSection";
import { GithubLinksSection, type GithubLinkCreatePayload } from "@/src/components/issue-detail/GithubLinksSection";
import { IssueActivityTabs, type IssueActivityTab } from "@/src/components/issue-detail/IssueActivityTabs";
import { IssueCommentForm } from "@/src/components/issue-detail/IssueCommentForm";
import { IssueDescriptionSection } from "@/src/components/issue-detail/IssueDescriptionSection";
import { IssueOverviewCards } from "@/src/components/issue-detail/IssueOverviewCards";
import { RelationsSection } from "@/src/components/issue-detail/RelationsSection";
import { SubticketsSection } from "@/src/components/issue-detail/SubticketsSection";

type JournalDetail = {
  property: string;
  name: string;
  old_value: string;
  new_value: string;
};

type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  details?: JournalDetail[];
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

type GithubLink = {
  id: string;
  repositoryFullName: string;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  url: string;
  title: string | null;
  createdAt: string;
};

type IssueChild = {
  id: number;
  subject: string;
  tracker?: string | null;
  statusName?: string | null;
  assignedToName?: string | null;
};

type Issue = {
  id: string;
  redmineIssueId: number | null;
  redmineBaseUrl: string | null;
  source: string;
  localIssueNumber: number | null;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  authorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  spentHours: number | null;
  customFieldsJson: Array<{
    id: number;
    name: string;
    value: string | null;
  }> | null;
  breadcrumbs: Array<{ id: number; subject: string; tracker?: string; isCached?: boolean }>;
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

function redmineIssueUrl(issue: Pick<Issue, "redmineBaseUrl" | "redmineIssueId">): string | null {
  const baseUrl = issue.redmineBaseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/issues/${issue.redmineIssueId}`;
}

function formatAgo(dateLike: string | undefined | null, t: (key: string, data?: Record<string, string | number>) => string): string {
  if (!dateLike) return "—";
  const ts = new Date(dateLike).getTime();
  if (Number.isNaN(ts)) return "—";
  const deltaSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return t("issues.ago.s", { count: deltaSec });
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return t("issues.ago.m", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("issues.ago.h", { count: hours });
  return t("issues.ago.d", { count: Math.floor(hours / 24) });
}

function formatDisplayDate(dateLike: string | null, t: (key: string, data?: Record<string, string | number>) => string): string {
  if (!dateLike) return t("issues.notSet");
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return t("issues.notSet");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function issueActivityAt(issue: Pick<Issue, "lastActivityAt" | "updatedOnRemote">): string {
  return issue.lastActivityAt ?? issue.updatedOnRemote;
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function translateStatusLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.notSet");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    new: "status.new",
    inprogress: "status.inProgress",
    progress: "status.inProgress",
    resolved: "status.resolved",
    feedback: "status.feedback",
    closed: "status.closed",
    rejected: "status.rejected",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

function translatePriorityLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.empty.noPriority");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    low: "priority.low",
    normal: "priority.normal",
    high: "priority.high",
    urgent: "priority.urgent",
    immediate: "priority.immediate",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

function translateTrackerLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.tracker");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    bug: "issues.trackers.bug",
    bugs: "issues.trackers.bugs",
    feature: "issues.trackers.feature",
    features: "issues.trackers.features",
    activity: "issues.trackers.activity",
    activities: "issues.trackers.activities",
    ticket: "issues.trackers.ticket",
    issue: "issues.trackers.issue",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

const ATTACHMENT_MARKER_RE = /\/api\/issues\/_ATTACHMENT_\/([^)]+)/gi;

function normalizeAttachmentFilename(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  const baseName = decoded.split("/").pop() ?? decoded;
  return baseName.toLowerCase();
}

function extractAttachmentRefsFromText(content: string): string[] {
  const refs: string[] = [];
  const normalized = normalizeRedmineText(content);
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = ATTACHMENT_MARKER_RE.exec(normalized)) !== null) {
    if (match[1]) {
      refs.push(decodeURIComponent(match[1]));
    }
  }
  return refs;
}

type IssueTab = IssueActivityTab;

function normalizeTab(raw: string | null): IssueTab {
  if (raw === "notes") return "notes";
  if (raw === "internal-notes") return "internal-notes";
  if (raw === "properties") return "properties";
  if (raw === "time_entries") return "time_entries";
  return "history";
}

function IssueLoadingShell() {
  return (
    <main className="dashboard issue-loading-page" aria-busy="true" aria-live="polite">
      <div className="issue-loading-breadcrumb skeleton-line" />

      <header className="card hero issue-hero issue-loading-hero">
        <div className="hero-top issue-loading-hero-top">
          <div className="issue-loading-head">
            <div className="skeleton-line issue-loading-kicker" />
            <div className="skeleton-line issue-loading-title" />
            <div className="skeleton-line issue-loading-subtitle" />
            <div className="issue-loading-chip-row">
              <div className="skeleton-line issue-loading-chip" />
              <div className="skeleton-line issue-loading-chip" />
              <div className="skeleton-line issue-loading-chip" />
            </div>
          </div>
          <div className="issue-loading-actions">
            <div className="skeleton-line issue-loading-action" />
            <div className="skeleton-line issue-loading-action" />
            <div className="skeleton-line issue-loading-action" />
          </div>
        </div>
      </header>

      <section className="quick-actions-panel issue-loading-panel">
        <div className="qa-header">
          <div className="skeleton-line issue-loading-qa-title" />
          <div className="skeleton-line issue-loading-qa-id" />
        </div>
        <div className="qa-meta-row">
          <div className="skeleton-line issue-loading-meta-pill" />
          <div className="skeleton-line issue-loading-meta-pill" />
        </div>
        <div className="qa-content issue-loading-qa-content">
          <div className="skeleton-line issue-loading-input" />
          <div className="skeleton-line issue-loading-input" />
          <div className="skeleton-line issue-loading-submit" />
        </div>
      </section>

      <section className="card reports-shell issue-detail-shell issue-loading-shell">
        <div className="reports-grid issue-overview-grid">
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
        </div>

        <article className="report-card report-skeleton-card issue-loading-description">
          <div className="skeleton-line skeleton-section-title" />
          <div className="skeleton-chart" />
        </article>

        <div className="issue-tabs issue-loading-tabs">
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
        </div>

        <article className="report-card report-skeleton-card issue-loading-timeline">
          <div className="skeleton-list">
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
          </div>
        </article>
      </section>
    </main>
  );
}

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const issueId = params.id;
  const activeTab = normalizeTab(searchParams.get("tab"));
  const tabFromUrl = searchParams.get("tab");
  const hasScrolledRef = useRef(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubBusy, setGithubBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [aiStatus, setAiStatus] = useState<{ available: boolean } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [transitionStatuses, setTransitionStatuses] = useState<AllowedStatusView[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [priorities, setPriorities] = useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<Array<{
    id: number;
    name: string;
    fieldFormat: string;
    possibleValues: Array<{ value: string }> | null;
    required: boolean;
  }>>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [hydratedRelatedIds, setHydratedRelatedIds] = useState<Set<number>>(new Set());
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const prefetchedRelatedIdsRef = useRef<Set<number>>(new Set());
  const attachmentRefreshAttemptedRef = useRef<Set<number>>(new Set());
  const { performAction, isBusy: commentBusy } = useOfflineAction();
  const { t, locale } = useI18n();

  const {
    notes: internalNotes,
    create: createInternalNote,
    update: updateInternalNote,
    remove: deleteInternalNote,
    busy: noteBusy,
  } = useInternalNotes({
    enabled: activeTab === "internal-notes",
    issueId: issue?.id ?? null,
    onError: (msg) => setActionError(msg),
    onInfo: (msg) => setActionInfo(msg),
    t,
  });

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    subject: string;
    description: string;
    priorityId: string;
    dueDate: string;
    estimatedHours: string;
    startDate: string;
    categoryId: string;
    customFields: Record<string, string>;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  async function reloadIssue() {
    const res = await fetch(`/api/issues/${issueId}?fresh=1`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load issue");
    }
    setIssue(data.issue ?? null);
  }

  async function refreshIssueFromRedmine() {
    setRefreshBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to refresh issue");
      }
      await reloadIssue();
      setActionInfo(t("issues.messages.refreshed"));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("issues.messages.refreshed"));
    } finally {
      setRefreshBusy(false);
    }
  }

  function startEditMode() {
    if (!issue) return;
    // Build custom fields map
    const customFields: Record<string, string> = {};
    if (issue.customFieldsJson) {
      for (const field of issue.customFieldsJson) {
        customFields[field.id] = field.value ?? "";
      }
    }
    setEditDraft({
      subject: issue.subject,
      description: issue.description ?? "",
      priorityId: issue.priorityId != null ? String(issue.priorityId) : "",
      dueDate: issue.dueDate ? new Date(issue.dueDate).toISOString().split("T")[0] : "",
      estimatedHours: issue.estimatedHours != null ? String(issue.estimatedHours) : "",
      startDate: issue.startDate ? new Date(issue.startDate).toISOString().split("T")[0] : "",
      categoryId: issue.categoryId != null ? String(issue.categoryId) : "",
      customFields,
    });
    setEditMode(true);
    setActionInfo(null);
    setActionError(null);
  }

  async function saveEdit() {
    if (!editDraft || !issue) return;
    setEditSaving(true);
    setActionError(null);
    try {
      let res: Response;

      if (isLocalOnlyIssue(issue)) {
        // True local-only issue (no real Redmine ticket to push to) → PATCH to local API
        res = await fetch(`/api/issues/local/${issue.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editDraft.subject || undefined,
            description: editDraft.description || null,
            tracker: issue.tracker ?? null,
            priority: editDraft.priorityId ? undefined : (issue.priority ?? null),
            priorityId: editDraft.priorityId ? parseInt(editDraft.priorityId, 10) : undefined,
            statusId: issue.statusId,
            statusName: issue.statusName,
            dueDate: editDraft.dueDate
              ? new Date(`${editDraft.dueDate}T00:00:00`).toISOString()
              : editDraft.dueDate === "" ? null : undefined,
            startDate: editDraft.startDate
              ? new Date(`${editDraft.startDate}T00:00:00`).toISOString()
              : editDraft.startDate === "" ? null : undefined,
            estimatedHours: editDraft.estimatedHours ? parseFloat(editDraft.estimatedHours) : undefined,
            doneRatio: issue.doneRatio ?? 0,
            parentIssueId: issue.parentIssueId ?? undefined,
            parentIssueLabel: issue.parentIssueLabel ?? undefined,
          }),
        });
      } else {
        // Real Redmine ticket (including source:"local" hybrid mirrors that
        // carry a redmineIssueId, e.g. recurring-tickets' auto-created
        // tickets) → PUT via Redmine API then re-sync, so the edit actually
        // lands before the next sync cycle pulls Redmine's copy back over it.
        res = await fetch(`/api/issues/${issueId}/edit`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: editDraft.subject || undefined,
            description: editDraft.description,
            priorityId: editDraft.priorityId ? parseInt(editDraft.priorityId, 10) : undefined,
            dueDate: editDraft.dueDate || undefined,
            estimatedHours: editDraft.estimatedHours ? parseFloat(editDraft.estimatedHours) : undefined,
            startDate: editDraft.startDate || undefined,
            categoryId: editDraft.categoryId ? parseInt(editDraft.categoryId, 10) : undefined,
            customFields: Object.entries(editDraft.customFields)
              .filter(([, v]) => v !== "")
              .map(([fieldId, value]) => ({ id: parseInt(fieldId, 10), value })),
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update issue");
      }
      await reloadIssue();
      setEditMode(false);
      setEditDraft(null);
      setActionInfo(
        isLocalOnlyIssue(issue)
          ? t("issues.messages.personalUpdated")
          : t("issues.messages.redmineUpdated"),
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update issue");
    } finally {
      setEditSaving(false);
    }
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditDraft(null);
    setActionError(null);
  }

  function updateCustomField(fieldId: string, value: string) {
    if (!editDraft) return;
    setEditDraft({
      ...editDraft,
      customFields: { ...editDraft.customFields, [fieldId]: value },
    });
  }

  useEffect(() => {
    if (!issueId || issueId.trim().length === 0) {
      setError(t("common.error"));
      setLoading(false);
      return;
    }
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/issues/${issueId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load issue");
        }
        if (mounted) {
          setIssue(data.issue ?? null);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Failed to load issue");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [issueId, t]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAiStatus(data);
        }
      } catch {
        setAiStatus(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!issue) {
      return;
    }
    setTransitionStatuses(issue.allowedStatuses ?? []);
    
    // Only fetch live statuses for Redmine issues, not local issues
    if (!issue.redmineIssueId) {
      return;
    }
    
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/status`, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (mounted && Array.isArray(data.allowedStatuses)) {
          setTransitionStatuses(data.allowedStatuses);
        }
      } catch {
        // Keep cached allowed statuses when the live lookup is unavailable.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [issue]);

  // Load activities and assignable users
  useEffect(() => {
    void (async () => {
      try {
        const [activitiesRes, usersRes, prioritiesRes, customFieldsRes] = await Promise.all([
          fetch("/api/internal/activities", { cache: "no-store" }),
          fetch("/api/internal/users", { cache: "no-store" }),
          fetch("/api/internal/priorities", { cache: "no-store" }),
          fetch("/api/internal/custom-fields", { cache: "no-store" }),
        ]);
        if (activitiesRes.ok) {
          const data = await activitiesRes.json();
          setActivities(data.activities ?? []);
        }
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users ?? []);
        }
        if (prioritiesRes.ok) {
          const data = await prioritiesRes.json();
          setPriorities(data.priorities ?? []);
        }
        if (customFieldsRes.ok) {
          const data = await customFieldsRes.json();
          setCustomFieldDefs(data.customFields ?? []);
        }
      } catch {
        // Ignore errors
      }
    })();
  }, []);

  async function submitGithubLink(payload: GithubLinkCreatePayload): Promise<boolean> {
    setGithubBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/github-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to link GitHub reference");
      }
      await reloadIssue();
      setActionInfo(t("issues.messages.githubLinked"));
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to link GitHub reference");
      return false;
    } finally {
      setGithubBusy(false);
    }
  }

  async function deleteGithubLink(linkId: string) {
    setGithubBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/github-links/${linkId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to remove GitHub link");
      }
      await reloadIssue();
      setActionInfo(t("issues.messages.githubRemoved"));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to remove GitHub link");
    } finally {
      setGithubBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!issue?.redmineIssueId) return;
    try {
      const res = await fetch(`/api/issues/${issue.redmineIssueId}/favorite`, {
        method: isFavorited ? "DELETE" : "POST",
      });
      if (res.ok) {
        setIsFavorited(!isFavorited);
      }
    } catch {
      // Ignore errors
    }
  }

  useEffect(() => {
    if (!issue || issue.source === "local") return;
    (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/favorite`);
        if (res.ok) {
          const data = await res.json();
          setIsFavorited(data.favorited ?? false);
        }
      } catch {
        // Ignore errors
      }
    })();
  }, [issue]);

  const totalSpent = useMemo(() => {
    if (!issue) return 0;
    return issue.timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  }, [issue]);

  const relatedPrefetchKey = issue
    ? Array.from(new Set([
      ...issue.children.map((child) => child.id),
      ...issue.breadcrumbs
        .map((crumb) => crumb.id)
        .filter((crumbId) => crumbId !== issue.redmineIssueId),
    ]))
      .sort((a, b) => a - b)
      .join(",")
    : "";

  useEffect(() => {
    if (!issue) {
      return;
    }

    const breadcrumbIds = issue.breadcrumbs
      .map((crumb) => crumb.id)
      .filter((crumbId) => crumbId !== issue.redmineIssueId);
    const childIds = issue.children
      .map((child) => child.id)
      .filter((childId) => childId !== issue.redmineIssueId);

    const orderedRelatedIds = [...new Set([...breadcrumbIds, ...childIds])];
    const pendingIds = orderedRelatedIds
      .filter((relatedId) => !prefetchedRelatedIdsRef.current.has(relatedId))
      .slice(0, 30);

    if (pendingIds.length === 0) {
      return;
    }

    let cancelled = false;
    const batchSize = 3;

    const timer = window.setTimeout(() => {
      void (async () => {
        for (let i = 0; i < pendingIds.length && !cancelled; i += batchSize) {
          const batch = pendingIds.slice(i, i + batchSize);
          await Promise.allSettled(
            batch.map(async (relatedId) => {
              if (cancelled) return;
              prefetchedRelatedIdsRef.current.add(relatedId);
              const res = await fetch(`/api/issues/${relatedId}`, { cache: "no-store" });
              if (!res.ok) {
                // Retry eligible on a future parent view if hydration failed this time.
                prefetchedRelatedIdsRef.current.delete(relatedId);
                return;
              }
              setHydratedRelatedIds((prev) => {
                if (prev.has(relatedId)) return prev;
                const next = new Set(prev);
                next.add(relatedId);
                return next;
              });
            }),
          );
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [issue, relatedPrefetchKey]);

  useEffect(() => {
    if (!issue) {
      return;
    }
    // Skip scroll on first load only when no ?tab= param (default tab)
    // If URL has ?tab=X, scroll so user sees the active tab section
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      if (!tabFromUrl) {
        return;
      }
    }
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeTab, issue, tabFromUrl]);

  const historyJournals = useMemo(() => {
    if (!issue) return [];
    return issue.journals.filter((journal) => {
      const hasNotes = Boolean(journal.notes?.trim());
      const details = journal.details ?? [];
      // Redmine auto-logs a journal entry every time a sub-issue is linked
      // (child_id changed from (none) to N). On tickets with many children
      // — recurring/hybrid mirrors especially — these entries have no notes
      // and drown out real history, so hide journals that are child_id-only.
      const isChildLinkNoise = details.length > 0 && details.every((d) => d.name === "child_id");
      if (!hasNotes && isChildLinkNoise) return false;
      return hasNotes || details.length > 0;
    });
  }, [issue]);

  const noteJournals = historyJournals;

  const propertyJournals = useMemo(() => {
    if (!issue) return [];
    const propertySignals = /\b(set to|changed|updated|status|priority|assignee|parent|category)\b/i;
    return issue.journals.filter((journal) => propertySignals.test(journal.notes ?? ""));
  }, [issue]);

  const hasUnresolvedAttachmentRefs = useMemo(() => {
    if (!issue) return false;
    const attachmentNames = new Set(
      issue.attachments.map((attachment) => normalizeAttachmentFilename(attachment.filename)),
    );
    const refs = [
      ...(issue.description ? extractAttachmentRefsFromText(issue.description) : []),
      ...issue.journals.flatMap((journal) => extractAttachmentRefsFromText(journal.notes ?? "")),
    ];
    if (refs.length === 0) return false;
    return refs.some((ref) => !attachmentNames.has(normalizeAttachmentFilename(ref)));
  }, [issue]);

  useEffect(() => {
    if (!issue || !hasUnresolvedAttachmentRefs || !issue.redmineIssueId) {
      return;
    }
    if (attachmentRefreshAttemptedRef.current.has(issue.redmineIssueId)) {
      return;
    }
    attachmentRefreshAttemptedRef.current.add(issue.redmineIssueId);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/attachments?refresh=1`, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items)) {
          setIssue((current) => {
            if (!current || current.redmineIssueId !== issue.redmineIssueId) {
              return current;
            }
            return {
              ...current,
              attachments: data.items,
            };
          });
        }
      } catch {
        // Keep current payload when attachment refresh fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [issue, hasUnresolvedAttachmentRefs]);

  const externalIssueUrl = issue ? redmineIssueUrl(issue) : null;
  const breadcrumbItems = issue?.breadcrumbs
    ? issue.breadcrumbs.filter((crumb) => crumb.id !== issue.redmineIssueId)
    : [];
  const redmineBaseForCrumbs = issue?.redmineBaseUrl?.trim().replace(/\/+$/, "") ?? "";

  if (loading) {
    return <IssueLoadingShell />;
  }

  if (error || !issue) {
    return (
      <main className="dashboard">
        <section className="card">
          <h1>{t("common.error")}</h1>
          <p className="muted">{error ?? t("issues.errors.notFound")}</p>
          <div className="row-actions">
            <Link href="/heimdall" className="primary-link">{t("issues.backToDashboard")}</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      {/* Breadcrumb Navigation */}
      {breadcrumbItems.length > 0 && (
        <nav className="breadcrumb-nav">
          <Link href="/" className="breadcrumb-item breadcrumb-home">{t("nav.dashboard")}</Link>
          <span className="breadcrumb-sep">›</span>
          {breadcrumbItems.map((crumb, i) => (
            <span key={crumb.id} className="breadcrumb-chain">
              {crumb.isCached !== false ? (
                <Link href={`/issues/${crumb.id}`} className="breadcrumb-item" target="_blank" rel="noopener noreferrer">
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </Link>
              ) : hydratedRelatedIds.has(crumb.id) ? (
                <Link href={`/issues/${crumb.id}`} className="breadcrumb-item" target="_blank" rel="noopener noreferrer">
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </Link>
              ) : redmineBaseForCrumbs ? (
                <a
                  href={`${redmineBaseForCrumbs}/issues/${crumb.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="breadcrumb-item breadcrumb-external"
                  title={t("issues.tooltips.openInRedmineNotCached")}
                >
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </a>
              ) : (
                <span className="breadcrumb-item breadcrumb-external" title={t("issues.tooltips.notAvailableLocally")}>
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </span>
              )}
              {i < breadcrumbItems.length - 1 && <span className="breadcrumb-sep">›</span>}
            </span>
          ))}
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-item breadcrumb-current">#{issue.redmineIssueId}</span>
        </nav>
      )}
      <header className="card hero issue-hero">
        <div className="hero-top issue-hero-top">
          <div className="issue-heading">
            <p className="kicker">{translateTrackerLabel(issue.tracker, t)}</p>
            <div className="issue-title-line">
              {issue.source === "local" ? (
                <>
                  <span className="source-badge source-local">{t("issues.badges.local")}</span>
                  {issue.localIssueNumber != null && (
                    <span className="redmine-issue-link muted">L-{issue.localIssueNumber}</span>
                  )}
                </>
              ) : (
                externalIssueUrl ? (
                  <a className="redmine-issue-link" href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                    #{issue.redmineIssueId}
                  </a>
                ) : (
                  <span className="redmine-issue-link muted">#{issue.redmineIssueId}</span>
                )
              )}
              {editMode && editDraft ? (
                <input
                  className="edit-title-input"
                  type="text"
                  value={editDraft.subject}
                  onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                  autoFocus
                />
              ) : (
                <h1>{issue.subject}</h1>
              )}
            </div>
            <p className="muted">
              {issue.projectName ?? t("issues.empty.noProject")} • {t("nav.groups.activity")} {formatAgo(issueActivityAt(issue), t)}
            </p>
            {externalIssueUrl && (
              <p className="external-issue-row">
                {t("issues.redmineSource")}
                <a href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                  {externalIssueUrl}
                </a>
              </p>
            )}
            <div className="chip-row">
              <span className="status-chip active">{translateStatusLabel(issue.statusName, t)}</span>
              <span className="status-chip">{translatePriorityLabel(issue.priority, t)}</span>
              <span className="status-chip">{issue.assignedToName ?? t("issues.empty.unassigned")}</span>
            </div>
            <div className="issue-snapshot-row">
              <div className="issue-snapshot">
                <span>{t("issues.fields.dueDate")}</span>
                <strong>{formatDisplayDate(issue.dueDate, t)}</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.fields.done")}</span>
                <strong>{issue.doneRatio ?? 0}%</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.fields.spentHours")}</span>
                <strong>{totalSpent.toFixed(1)}h</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.sections.history")}</span>
                <strong>{formatAgo(issueActivityAt(issue), t)}</strong>
              </div>
            </div>
          </div>
          <div className="hero-actions issue-hero-actions">
            {!editMode && issue.source !== "local" && (
              <button type="button" className={`favorite-btn ${isFavorited ? "favorited" : ""}`} onClick={toggleFavorite} title={isFavorited ? t("issues.actions.removeFromFavorites") : t("issues.actions.addToFavorites")}>
                {isFavorited ? t("issues.actions.favorited") : t("issues.actions.favorite")}
              </button>
            )}
            {!editMode && issue.source !== "local" && (
              <button type="button" className="secondary-button issue-refresh-button" onClick={() => void refreshIssueFromRedmine()} disabled={refreshBusy}>
                {refreshBusy ? t("common.loading") : t("issues.actions.refresh")}
              </button>
            )}
            {!editMode && issue.source === "local" && (
              <button
                type="button"
                className="secondary-button issue-delete-button"
                onClick={async () => {
                  if (!confirm(t("issues.actions.confirmDelete", { name: issue.subject }))) return;
                  try {
                    const res = await fetch(`/api/issues/local/${issue.id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(t("issues.messages.noteFailed"));
                    window.location.href = "/";
                  } catch (e) {
                    alert(e instanceof Error ? e.message : t("issues.messages.noteFailed"));
                  }
                }}
              >
                {t("issues.actions.delete")}
              </button>
            )}
            {!editMode && (
              <button type="button" className="primary-link" onClick={startEditMode}>
                {t("issues.actions.edit")}
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Quick Actions Panel — only for Redmine issues */}
      {(issue.redmineIssueId || issue.source === "local") && (
        <QuickActionsPanel
          issueId={issue.redmineIssueId ?? 0}
            currentStatus={translateStatusLabel(issue.statusName, t)}
          currentAssignee={issue.assignedToName ?? undefined}
          onStatusChange={async (statusId) => {
            if (isLocalOnlyIssue(issue)) {
              const statusEntry = transitionStatuses.find((s) => s.id === statusId);
              const res = await fetch(`/api/issues/local/${issue.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statusId, statusName: statusEntry?.name ?? issue.statusName }),
              });
              if (!res.ok) throw new Error("Failed to update status");
              await reloadIssue();
              setActionInfo(t("issues.messages.statusUpdated"));
            } else {
              await performAction({
                type: "update_status",
                issueId,
                payload: { statusId },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.statusUpdated"),
              });
            }
          }}
          onAssign={async (userId) => {
            if (isLocalOnlyIssue(issue)) {
              const user = users.find((u) => u.id === userId);
              const res = await fetch(`/api/issues/local/${issue.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedToId: userId, assignedToName: user?.name ?? null }),
              });
              if (!res.ok) throw new Error("Failed to assign");
              await reloadIssue();
              setActionInfo(t("issues.messages.assigned"));
            } else {
              await performAction({
                type: "assign",
                issueId,
                payload: { userId },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.assigned"),
              });
            }
          }}
          onAddTime={async (hours, comment) => {
            if (isLocalOnlyIssue(issue)) {
              const res = await fetch(`/api/issues/local/${issue.id}/time`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hours, comments: comment }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to log time");
              }
              await reloadIssue();
              setActionInfo(t("issues.messages.timeLogged"));
            } else {
              await performAction({
                type: "log_time",
                issueId,
                // timeLogSchema (POST /api/issues/[id]/timelog) requires
                // activityId and a singular `comment` — 31 is the known-active
                // Development activity for manual and WakaTime-derived entries.
                payload: { hours, activityId: 31, comment },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.timeLogged"),
              });
            }
          }}
          statuses={transitionStatuses}
          users={users}
        />
      )}

      <section className="card reports-shell issue-detail-shell">
        <div className="reports-head">
          <div>
            <h2>{t("issues.sections.overview")}</h2>
            <p className="muted">{t("issues.sections.overviewSubtitle")}</p>
          </div>
        </div>

        <IssueOverviewCards
          statusName={issue.statusName}
          priority={issue.priority}
          dueDate={issue.dueDate}
          doneRatio={issue.doneRatio}
          totalSpent={totalSpent}
          assignedToName={issue.assignedToName}
          locale={locale}
          formatStatus={(statusName) => translateStatusLabel(statusName, t)}
          formatPriority={(priority) => translatePriorityLabel(priority, t)}
        />

        <IssueDescriptionSection
          description={issue.description}
          attachments={issue.attachments}
          redmineIssueId={issue.redmineIssueId}
          isEditing={editMode && editDraft !== null}
          editingDescription={editDraft?.description ?? ""}
          onDescriptionChange={(description) => {
            if (editDraft) {
              setEditDraft({ ...editDraft, description });
            }
          }}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
        />

        {/* Issue Metadata Section */}
        {(issue.authorName || issue.categoryName || issue.startDate || issue.estimatedHours || issue.spentHours || (issue.customFieldsJson && issue.customFieldsJson.length > 0)) && (
          <article className="report-card issue-metadata-card">
            <details className="issue-collapsible">
              <summary>{t("issues.sections.metadata")}</summary>
              {editMode && editDraft && (
                <div className="edit-actions">
                  <button type="button" className="edit-save-btn" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? t("common.loading") : t("issues.actions.save")}
                  </button>
                  <button type="button" className="edit-cancel-btn" onClick={cancelEditMode} disabled={editSaving}>
                    {t("issues.actions.cancel")}
                  </button>
                </div>
              )}
              <div className="metadata-grid">
                {/* Show read-only fields only when NOT in edit mode */}
                {!editMode && issue.authorName && (
                  <div className="metadata-item">
                    <span className="metadata-label">{t("issues.fields.author")}</span>
                    <span className="metadata-value">{issue.authorName}</span>
                  </div>
                )}
                {issue.categoryName && !editMode && (
                  <div className="metadata-item">
                    <span className="metadata-label">{t("issues.fields.category")}</span>
                    <span className="metadata-value">{issue.categoryName}</span>
                  </div>
                )}
                {editMode && editDraft ? (
                  <>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">{t("issues.fields.startDate")}</span>
                      <input
                        type="date"
                        className="edit-metadata-input edit-date-input"
                        value={editDraft.startDate}
                        onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                      />
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">{t("issues.fields.dueDate")}</span>
                      <input
                        type="date"
                        className="edit-metadata-input edit-date-input"
                        value={editDraft.dueDate}
                        onChange={(e) => setEditDraft({ ...editDraft, dueDate: e.target.value })}
                      />
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">{t("issues.fields.category")}</span>
                      <select
                        className="edit-metadata-input edit-category-select"
                        value={editDraft.categoryId}
                        onChange={(e) => setEditDraft({ ...editDraft, categoryId: e.target.value })}
                      >
                        <option value="">— {t("issues.empty.noCategory")} —</option>
                        <option value="32">activities</option>
                        <option value="33">bugs</option>
                        <option value="34">features</option>
                      </select>
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">{t("issues.fields.priority")}</span>
                      <select
                        className="edit-metadata-input edit-priority-select"
                        value={editDraft.priorityId}
                        onChange={(e) => setEditDraft({ ...editDraft, priorityId: e.target.value })}
                      >
                        <option value="">— {t("issues.empty.noPriority")} —</option>
                        {priorities.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (default)" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">{t("issues.fields.estimatedHours")}</span>
                      <input
                        type="number"
                        className="edit-metadata-input"
                        value={editDraft.estimatedHours}
                        onChange={(e) => setEditDraft({ ...editDraft, estimatedHours: e.target.value })}
                        step="0.25"
                        min="0"
                        placeholder="0"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {issue.startDate && (
                      <div className="metadata-item">
                        <span className="metadata-label">{t("issues.fields.startDate")}</span>
                        <span className="metadata-value">{new Date(issue.startDate).toLocaleDateString(locale)}</span>
                      </div>
                    )}
                    {issue.dueDate && (
                      <div className="metadata-item">
                        <span className="metadata-label">{t("issues.fields.dueDate")}</span>
                        <span className="metadata-value">{new Date(issue.dueDate).toLocaleDateString(locale)}</span>
                      </div>
                    )}
                    {issue.priority && (
                      <div className="metadata-item">
                        <span className="metadata-label">{t("issues.fields.priority")}</span>
                        <span className="metadata-value">{translatePriorityLabel(issue.priority, t)}</span>
                      </div>
                    )}
                    {issue.estimatedHours != null && (
                      <div className="metadata-item">
                        <span className="metadata-label">{t("issues.fields.estimatedHours")}</span>
                        <span className="metadata-value">{issue.estimatedHours.toFixed(2)}h</span>
                      </div>
                    )}
                  </>
                )}
                {/* Always show spent hours as read-only (not editable) */}
                {issue.spentHours != null && (
                  <div className="metadata-item metadata-item-readonly">
                    <span className="metadata-label">{t("issues.fields.spentHours")} (Redmine)</span>
                    <span className="metadata-value">{issue.spentHours.toFixed(2)}h</span>
                  </div>
                )}

                {/* Custom fields with values */}
                {issue.customFieldsJson && issue.customFieldsJson
                  .filter((field) => editMode ? true : (field.value && field.value.trim().length > 0))
                  .map((field) => {
                    // Special handling for "Possible assignee" custom field
                      if (field.name === "Possible assignee") {
                        if (editMode && editDraft) {
                          const assigneeUserId = parseInt(editDraft.customFields[field.id] || "0", 10);
                          return (
                          <div key={field.id} className="metadata-item metadata-item-assignee">
                            <span className="metadata-label">{field.name}</span>
                            <span className="metadata-value">
                              <select
                                className="edit-custom-user-select"
                                value={assigneeUserId || ""}
                                onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              >
                                <option value="">— {t("issues.empty.unset")} —</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </span>
                          </div>
                        );
                      }

                      if (field.value) {
                        const assigneeUserId = parseInt(field.value, 10);
                        const matchedUser = users.find((u) => u.id === assigneeUserId);
                        return (
                          <div key={field.id} className="metadata-item metadata-item-assignee">
                            <span className="metadata-label">{field.name}</span>
                            <span className="metadata-value">
                              {matchedUser ? (
                                <span className="assignee-user">
                                  👤 {matchedUser.name}
                                  <button
                                    type="button"
                                    className="assign-btn"
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/issues/${issueId}/assign`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ userId: assigneeUserId }),
                                        });
                                        if (!res.ok) {
                                          const data = await res.json();
                                          throw new Error(data.error || t("issues.messages.assignFailed"));
                                        }
                                        await reloadIssue();
                                        setActionInfo(t("issues.messages.assignedTo", { name: matchedUser.name }));
                                      } catch (e) {
                                        setActionError(e instanceof Error ? e.message : t("issues.messages.assignFailed"));
                                      }
                                    }}
                                    title={t("issues.actions.assignTo", { name: matchedUser.name })}
                                  >
                                    {t("issues.actions.assign")}
                                  </button>
                                </span>
                              ) : (
                                `User #${assigneeUserId}`
                              )}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    }

                    // Get field definition for proper UI rendering
                    const fieldDef = customFieldDefs.find(f => f.id === field.id);
                    const fieldFormat = fieldDef?.fieldFormat ?? "string";
                    const possibleValues = fieldDef?.possibleValues ?? [];
                    const isRequired = fieldDef?.required ?? false;

                    // Editable custom field
                    if (editMode && editDraft) {
                      const isDateField = fieldFormat === "date" || /due\s*date|date|sd\s*due|temp\s*fix/i.test(field.name);
                      const isBoolField = fieldFormat === "bool" || fieldFormat === "checkbox";
                      const isListField = fieldFormat === "list" || fieldFormat === "radio";

                      return (
                        <div key={field.id} className="metadata-item metadata-item-editable">
                          <span className="metadata-label">
                            {field.name}
                            {isRequired && <span className="required-mark">*</span>}
                          </span>
                          {isBoolField ? (
                            <label className="edit-checkbox-label">
                              <input
                                type="checkbox"
                                className="edit-custom-checkbox"
                                checked={editDraft.customFields[field.id] === "1" || editDraft.customFields[field.id] === "true"}
                                onChange={(e) => updateCustomField(String(field.id), e.target.checked ? "1" : "0")}
                              />
                              <span className="checkbox-label-text">{editDraft.customFields[field.id] === "1" || editDraft.customFields[field.id] === "true" ? t("common.yes") : t("common.no")}</span>
                            </label>
                          ) : isListField && possibleValues.length > 0 ? (
                            <select
                              className="edit-custom-select"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                            >
                              <option value="">— {isRequired ? t("issues.actions.select") : t("issues.empty.unset")} —</option>
                              {possibleValues.map((pv) => (
                                <option key={pv.value} value={pv.value}>{pv.value}</option>
                              ))}
                            </select>
                          ) : isDateField ? (
                            <input
                              type="date"
                              className="edit-metadata-input edit-date-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                            />
                          ) : fieldFormat === "int" || fieldFormat === "float" ? (
                            <input
                              type="number"
                              className="edit-metadata-input edit-number-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              step={fieldFormat === "float" ? "0.01" : "1"}
                            />
                          ) : (
                            <input
                              type="text"
                              className="edit-metadata-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              placeholder={field.name}
                            />
                          )}
                        </div>
                      );
                    }

                    // Display custom field - use field definition for proper rendering
                    if (field.value && field.value.trim().length > 0) {
                      const isBoolField = fieldFormat === "bool" || fieldFormat === "checkbox";
                      const isListField = fieldFormat === "list" || fieldFormat === "radio";

                      return (
                        <div key={field.id} className="metadata-item">
                          <span className="metadata-label">{field.name}</span>
                          <span className="metadata-value">
                            {isBoolField ? (
                              <span className={`bool-value ${field.value === "1" || field.value === "true" ? "bool-true" : "bool-false"}`}>
                                {field.value === "1" || field.value === "true" ? t("issues.values.trueYes") : t("issues.values.falseNo")}
                              </span>
                            ) : isListField ? (
                              <span className="list-value">{field.value}</span>
                            ) : (
                              field.value
                            )}
                          </span>
                        </div>
                      );
                    }

                    return null;
                  })}
              </div>
            </details>
          </article>
        )}

        {aiStatus?.available && (
          <AiIssueActions
            issueId={issue.id}
            existingSummaries={(issue as unknown as { aiSummaries?: Array<{ id: string; summary: string; model: string; createdAt: string; totalDuration: string | null; loadDuration: string | null; promptEvalCount: number | null; promptEvalDuration: string | null; evalCount: number | null; evalDuration: string | null }> }).aiSummaries ?? []}
          />
        )}

        <SubticketsSection
          subtickets={issue.children}
          formatStatus={(statusName) => translateStatusLabel(statusName, t)}
        />

        <RelationsSection relations={issue.relations} />

        <AttachmentsSection
          attachments={issue.attachments}
          redmineIssueId={issue.redmineIssueId}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
        />

        <GithubLinksSection
          links={issue.githubLinks}
          busy={githubBusy}
          actionError={actionError}
          actionInfo={actionInfo}
          onCreate={submitGithubLink}
          onDelete={deleteGithubLink}
        />

        <IssueCommentForm
          value={comment}
          busy={commentBusy}
          actionError={actionError}
          actionInfo={actionInfo}
          onChange={setComment}
          onSubmit={async () => {
            await performAction({
              type: "comment",
              issueId,
              payload: { notes: comment },
              onSuccess: () => {
                setComment("");
                void reloadIssue();
              },
              successMessage: "Comment posted to Redmine.",
            });
          }}
        />

        <IssueActivityTabs
          issueId={issue.id}
          redmineIssueId={issue.redmineIssueId}
          attachments={issue.attachments}
          timeEntries={issue.timeEntries}
          historyJournals={historyJournals}
          noteJournals={noteJournals}
          propertyJournals={propertyJournals}
          activeTab={activeTab}
          tabsRef={tabsRef}
          internalNotes={internalNotes}
          noteBusy={noteBusy}
          onCreateInternalNote={createInternalNote}
          onUpdateInternalNote={updateInternalNote}
          onDeleteInternalNote={deleteInternalNote}
          onAddTimeEntry={async (hours, activityId, comments, spentOn) => {
            await performAction({
              type: "log_time",
              issueId,
              // timeLogSchema expects `comment` (singular), not `comments`.
              payload: { hours, activityId, comment: comments, spentOn },
              onSuccess: reloadIssue,
              successMessage: t("issues.messages.redmineUpdated"),
            });
          }}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
          formatAgo={(iso) => formatAgo(iso, t)}
          actionError={actionError}
          activities={activities}
        />
      </section>

      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImage(null)} aria-label="Close">
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxImage.src} alt={lightboxImage.alt} className="lightbox-image" />
            <p className="lightbox-caption">{lightboxImage.alt}</p>
          </div>
        </div>
      )}
      {issue.redmineIssueId && <ChatFab issueId={issue.redmineIssueId} />}
    </main>
  );
}
