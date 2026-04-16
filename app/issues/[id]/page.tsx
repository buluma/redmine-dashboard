"use client";

import { AllowedStatusView } from "@/src/lib/issue-shape";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { normalizeRedmineText, splitRedmineCollapseSegments } from "@/src/lib/redmine-text-format";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { ChatFab } from "@/src/components/ai/ChatFab";
import { TimeTrackingPanel } from "@/src/components/TimeTrackingPanel";
import { QuickActionsPanel } from "@/src/components/QuickActionsPanel";
import { useOfflineAction } from "@/src/hooks/useOfflineAction";

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

function MarkdownBlock({ content, attachments = [], issueId, onImageClick }: { content: string; attachments?: Attachment[]; issueId?: number; onImageClick?: (src: string, alt: string) => void }) {
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

  // Custom img component to handle attachment images in markdown
  function MarkdownImage({ src, alt }: { src?: string | Blob; alt?: string }) {
    if (!src || typeof src === "object") return null;
    const srcText = src.toString();
    const attachmentMarker = "/api/issues/_ATTACHMENT_/";
    const filename = srcText.includes(attachmentMarker)
      ? decodeURIComponent(srcText.slice(srcText.indexOf(attachmentMarker) + attachmentMarker.length))
      : srcText.split("/").pop() ?? alt ?? "image";

    if (srcText.includes(attachmentMarker)) {
      const attachment = attachments.find((a) => filenamesMatch(a.filename, filename));
      if (!attachment || !issueId) return <span className="muted">[Image: {filename}]</span>;
      const url = attachmentUrl(issueId, attachment.redmineAttachmentId);
      return (
        <span className="markdown-image-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="attachment-preview-image clickable"
            src={url}
            alt={alt ?? filename}
            loading="lazy"
            onClick={() => onImageClick?.(url, alt ?? filename)}
          />
        </span>
      );
    }

    return (
      <span className="markdown-image-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="attachment-preview-image clickable"
          src={srcText}
          alt={alt ?? filename}
          loading="lazy"
          onClick={() => onImageClick?.(srcText, alt ?? filename)}
        />
      </span>
    );
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

function attachmentUrl(issueId: number | null, attachmentId: number): string {
  if (!issueId) return "#";
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
  return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".gif") || name.endsWith(".webp");
}

function isPdfAttachment(attachment: Attachment): boolean {
  const type = (attachment.contentType ?? "").toLowerCase();
  return type === "application/pdf" || attachment.filename.toLowerCase().endsWith(".pdf");
}

function formatAgo(dateLike: string | undefined | null): string {
  if (!dateLike) return "—";
  const ts = new Date(dateLike).getTime();
  if (Number.isNaN(ts)) return "—";
  const deltaSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDisplayDate(dateLike: string | null): string {
  if (!dateLike) return "Not set";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function issueActivityAt(issue: Pick<Issue, "lastActivityAt" | "updatedOnRemote">): string {
  return issue.lastActivityAt ?? issue.updatedOnRemote;
}

const ATTACHMENT_MARKER_RE = /\/api\/issues\/_ATTACHMENT_\/([^)]+)/gi;

function normalizeAttachmentFilename(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  const baseName = decoded.split("/").pop() ?? decoded;
  return baseName.toLowerCase();
}

function filenamesMatch(left: string, right: string): boolean {
  return normalizeAttachmentFilename(left) === normalizeAttachmentFilename(right);
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

type IssueTab = "history" | "notes" | "internal-notes" | "properties" | "time_entries";

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
  const [githubRepo, setGithubRepo] = useState("");
  const [githubIssueNumber, setGithubIssueNumber] = useState("");
  const [githubPrNumber, setGithubPrNumber] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [githubTitle, setGithubTitle] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ available: boolean } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const [transitionStatuses, setTransitionStatuses] = useState<AllowedStatusView[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [priorities, setPriorities] = useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const [internalNotes, setInternalNotes] = useState<Array<{
    id: string;
    issueId: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    authorName: string;
  }>>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [hydratedRelatedIds, setHydratedRelatedIds] = useState<Set<number>>(new Set());
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const prefetchedRelatedIdsRef = useRef<Set<number>>(new Set());
  const attachmentRefreshAttemptedRef = useRef<Set<number>>(new Set());
  const { performAction } = useOfflineAction();

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
      setActionInfo("Issue refreshed from Redmine.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to refresh issue");
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

      if (issue.source === "local") {
        // Local issue → PATCH to local API
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
        // Redmine issue → PUT via Redmine API then re-sync
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
      setActionInfo(issue.source === "local" ? "Personal ticket updated." : "Issue updated in Redmine successfully.");
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
      setError("Invalid issue id");
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
  }, [issueId]);

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

  const loadInternalNotes = useCallback(async () => {
    try {
      if (!issue) return;
      const res = await fetch(`/api/internal/notes?issueId=${issue.id}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setInternalNotes(data.notes ?? []);
      }
    } catch {
      // Ignore errors
    }
  }, [issue]);

  // Load activities and assignable users
  useEffect(() => {
    void (async () => {
      try {
        const [activitiesRes, usersRes, prioritiesRes] = await Promise.all([
          fetch("/api/internal/activities", { cache: "no-store" }),
          fetch("/api/internal/users", { cache: "no-store" }),
          fetch("/api/internal/priorities", { cache: "no-store" }),
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
      } catch {
        // Ignore errors
      }
    })();
  }, []);

  useEffect(() => {
    if (activeTab !== "internal-notes") {
      return;
    }
    void loadInternalNotes();
  }, [activeTab, loadInternalNotes]);

  async function submitGithubLink(event: React.FormEvent) {
    event.preventDefault();
    setGithubBusy(true);
    setActionError(null);
    setActionInfo(null);
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
      setGithubIssueNumber("");
      setGithubPrNumber("");
      setGithubUrl("");
      setGithubTitle("");
      setActionInfo("GitHub link added.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to link GitHub reference");
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
      setActionInfo("GitHub link removed.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to remove GitHub link");
    } finally {
      setGithubBusy(false);
    }
  }

  async function submitInternalNote(event: React.FormEvent) {
    event.preventDefault();
    if (!newNoteContent.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      if (!issue) { setNoteBusy(false); return; }
      const res = await fetch("/api/internal/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue.id, content: newNoteContent.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add note");
      }
      setNewNoteContent("");
      await loadInternalNotes();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteInternalNote(noteId: string) {
    try {
      const res = await fetch(`/api/internal/notes/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      await loadInternalNotes();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete note");
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

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      return;
    }
    setCommentBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to post comment");
      }
      setComment("");
      await reloadIssue();
      setActionInfo("Comment posted to Redmine.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unable to post comment");
    } finally {
      setCommentBusy(false);
    }
  }

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
    return issue.journals.filter((journal) => Boolean(journal.notes?.trim()));
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
          <h1>Issue could not be loaded</h1>
          <p className="muted">{error ?? "Issue not found."}</p>
          <div className="row-actions">
            <Link href="/heimdall" className="primary-link">Back to Heimdall</Link>

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
          <Link href="/" className="breadcrumb-item breadcrumb-home">Dashboard</Link>
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
                  title="Open in Redmine (not cached locally)"
                >
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </a>
              ) : (
                <span className="breadcrumb-item breadcrumb-external" title="Not available locally">
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
            <p className="kicker">{issue.tracker ?? "Issue"}</p>
            <div className="issue-title-line">
              {issue.source === "local" ? (
                <span className="source-badge source-local">🟢 Local</span>
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
              {issue.projectName ?? "No project"} • Activity {formatAgo(issueActivityAt(issue))}
            </p>
            {externalIssueUrl && (
              <p className="external-issue-row">
                Redmine source:
                <a href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                  {externalIssueUrl}
                </a>
              </p>
            )}
            <div className="chip-row">
              <span className="status-chip active">{issue.statusName}</span>
              <span className="status-chip">{issue.priority ?? "No priority"}</span>
              <span className="status-chip">{issue.assignedToName ?? "Unassigned"}</span>
            </div>
            <div className="issue-snapshot-row">
              <div className="issue-snapshot">
                <span>Due</span>
                <strong>{formatDisplayDate(issue.dueDate)}</strong>
              </div>
              <div className="issue-snapshot">
                <span>Progress</span>
                <strong>{issue.doneRatio ?? 0}%</strong>
              </div>
              <div className="issue-snapshot">
                <span>Logged</span>
                <strong>{totalSpent.toFixed(1)}h</strong>
              </div>
              <div className="issue-snapshot">
                <span>Last activity</span>
                <strong>{formatAgo(issueActivityAt(issue))}</strong>
              </div>
            </div>
          </div>
          <div className="hero-actions issue-hero-actions">
            {!editMode && issue.source !== "local" && (
              <button type="button" className={`favorite-btn ${isFavorited ? "favorited" : ""}`} onClick={toggleFavorite} title={isFavorited ? "Remove from favorites" : "Add to favorites"}>
                {isFavorited ? "★ Favorited" : "☆ Favorite"}
              </button>
            )}
            {!editMode && issue.source !== "local" && (
              <button type="button" className="secondary-button issue-refresh-button" onClick={() => void refreshIssueFromRedmine()} disabled={refreshBusy}>
                {refreshBusy ? "Refreshing..." : "Refresh"}
              </button>
            )}
            {!editMode && issue.source === "local" && (
              <button
                type="button"
                className="secondary-button issue-delete-button"
                onClick={async () => {
                  if (!confirm(`Delete "${issue.subject}"? This cannot be undone.`)) return;
                  try {
                    const res = await fetch(`/api/issues/local/${issue.id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error("Delete failed");
                    window.location.href = "/";
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "Delete failed");
                  }
                }}
              >
                Delete
              </button>
            )}
            {!editMode && (
              <button type="button" className="primary-link" onClick={startEditMode}>
                Edit
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Quick Actions Panel — only for Redmine issues */}
      {issue.redmineIssueId && (
        <QuickActionsPanel
          issueId={issue.redmineIssueId}
          currentStatus={issue.statusName}
          currentAssignee={issue.assignedToName ?? undefined}
          onStatusChange={async (statusId) => {
            await performAction({
              type: "update_status",
              issueId,
              payload: { statusId },
              onSuccess: reloadIssue,
              successMessage: "Status updated in Redmine.",
            });
          }}
          onAssign={async (userId) => {
            await performAction({
              type: "assign",
              issueId,
              payload: { userId },
              onSuccess: reloadIssue,
              successMessage: "Issue assigned.",
            });
          }}
          onAddTime={async (hours, comment) => {
            await performAction({
              type: "log_time",
              issueId,
              payload: { hours, comments: comment },
              onSuccess: reloadIssue,
              successMessage: "Time entry logged.",
            });
          }}
          statuses={transitionStatuses}
          users={users}
        />
      )}

      <section className="card reports-shell issue-detail-shell">
        <div className="reports-head">
          <div>
            <h2>Issue Overview</h2>
            <p className="muted">Core fields and delivery snapshot for this issue.</p>
          </div>
        </div>

        <div className="reports-grid issue-overview-grid">
          <article className="report-card overview-card overview-card-status">
            <p className="report-label">Status</p>
            <p className="report-value">{issue.statusName}</p>
            <p className="report-foot">Priority: {issue.priority ?? "-"}</p>
          </article>
          <article className="report-card overview-card overview-card-due">
            <p className="report-label">Due Date</p>
            <p className="report-value">{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</p>
            <p className="report-foot">% Done: {issue.doneRatio ?? 0}%</p>
          </article>
          <article className="report-card overview-card overview-card-time">
            <p className="report-label">Spent Time</p>
            <p className="report-value">{totalSpent.toFixed(1)}h</p>
            <p className="report-foot">Assignee: {issue.assignedToName ?? "Unassigned"}</p>
          </article>
        </div>

        <article className="report-card issue-description-card">
          <p className="report-label">Description</p>
          {editMode && editDraft ? (
            <textarea
              className="edit-description-textarea"
              value={editDraft.description}
              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
              rows={8}
              placeholder="Issue description (Textile formatting supported)"
            />
          ) : issue.description ? (
            <MarkdownBlock content={issue.description} attachments={issue.attachments} issueId={issue.redmineIssueId ?? undefined} onImageClick={(src, alt) => setLightboxImage({ src, alt })} />
          ) : (
            <p className="muted">No description.</p>
          )}
        </article>

        {/* Issue Metadata Section */}
        {(issue.authorName || issue.categoryName || issue.startDate || issue.estimatedHours || issue.spentHours || (issue.customFieldsJson && issue.customFieldsJson.length > 0)) && (
          <article className="report-card issue-metadata-card">
            <details className="issue-collapsible">
              <summary>Issue Metadata</summary>
              {editMode && editDraft && (
                <div className="edit-actions">
                  <button type="button" className="edit-save-btn" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? "Saving..." : "💾 Save Changes"}
                  </button>
                  <button type="button" className="edit-cancel-btn" onClick={cancelEditMode} disabled={editSaving}>
                    Cancel
                  </button>
                </div>
              )}
              <div className="metadata-grid">
                {/* Show read-only fields only when NOT in edit mode */}
                {!editMode && issue.authorName && (
                  <div className="metadata-item">
                    <span className="metadata-label">Author</span>
                    <span className="metadata-value">{issue.authorName}</span>
                  </div>
                )}
                {issue.categoryName && !editMode && (
                  <div className="metadata-item">
                    <span className="metadata-label">Category</span>
                    <span className="metadata-value">{issue.categoryName}</span>
                  </div>
                )}
                {editMode && editDraft ? (
                  <>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">Start Date</span>
                      <input
                        type="date"
                        className="edit-metadata-input edit-date-input"
                        value={editDraft.startDate}
                        onChange={(e) => setEditDraft({ ...editDraft, startDate: e.target.value })}
                      />
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">Due Date</span>
                      <input
                        type="date"
                        className="edit-metadata-input edit-date-input"
                        value={editDraft.dueDate}
                        onChange={(e) => setEditDraft({ ...editDraft, dueDate: e.target.value })}
                      />
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">Category</span>
                      <select
                        className="edit-metadata-input edit-category-select"
                        value={editDraft.categoryId}
                        onChange={(e) => setEditDraft({ ...editDraft, categoryId: e.target.value })}
                      >
                        <option value="">— No category —</option>
                        <option value="32">activities</option>
                        <option value="33">bugs</option>
                        <option value="34">features</option>
                      </select>
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">Priority</span>
                      <select
                        className="edit-metadata-input edit-priority-select"
                        value={editDraft.priorityId}
                        onChange={(e) => setEditDraft({ ...editDraft, priorityId: e.target.value })}
                      >
                        <option value="">— No priority —</option>
                        {priorities.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (default)" : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="metadata-item metadata-item-editable">
                      <span className="metadata-label">Estimated Hours</span>
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
                        <span className="metadata-label">Start Date</span>
                        <span className="metadata-value">{new Date(issue.startDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {issue.dueDate && (
                      <div className="metadata-item">
                        <span className="metadata-label">Due Date</span>
                        <span className="metadata-value">{new Date(issue.dueDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {issue.priority && (
                      <div className="metadata-item">
                        <span className="metadata-label">Priority</span>
                        <span className="metadata-value">{issue.priority}</span>
                      </div>
                    )}
                    {issue.estimatedHours != null && (
                      <div className="metadata-item">
                        <span className="metadata-label">Estimated Hours</span>
                        <span className="metadata-value">{issue.estimatedHours.toFixed(2)}h</span>
                      </div>
                    )}
                  </>
                )}
                {/* Always show spent hours as read-only (not editable) */}
                {issue.spentHours != null && (
                  <div className="metadata-item metadata-item-readonly">
                    <span className="metadata-label">Spent Hours (Redmine)</span>
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
                                <option value="">— Unset —</option>
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
                                          throw new Error(data.error || "Failed to assign");
                                        }
                                        await reloadIssue();
                                        setActionInfo(`Assigned to ${matchedUser.name}`);
                                      } catch (e) {
                                        setActionError(e instanceof Error ? e.message : "Failed to assign");
                                      }
                                    }}
                                    title={`Assign to ${matchedUser.name}`}
                                  >
                                    Assign
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

                    // Editable custom field
                    if (editMode && editDraft) {
                      const isDateField = /due\s*date|date|sd\s*due|temp\s*fix/i.test(field.name);
                      return (
                        <div key={field.id} className="metadata-item metadata-item-editable">
                          <span className="metadata-label">{field.name}</span>
                          {isDateField ? (
                            <input
                              type="date"
                              className="edit-metadata-input edit-date-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
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

                    // Display custom field
                    if (field.value && field.value.trim().length > 0) {
                      return (
                        <div key={field.id} className="metadata-item">
                          <span className="metadata-label">{field.name}</span>
                          <span className="metadata-value">{field.value}</span>
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

        <article className="report-card">
          <details className="issue-collapsible">
            <summary>
              Child Issues
              <span className="muted">({issue.children ? issue.children.length : 0})</span>
            </summary>
            {issue.children && issue.children.length > 0 ? (
              <div className="children-table-wrap">
                <table className="children-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tracker</th>
                      <th>Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issue.children.map((child) => (
                      <tr key={child.id}>
                        <td>
                          <Link href={`/issues/${child.id}`} className="child-issue-link" target="_blank" rel="noopener noreferrer">
                            #{child.id}
                          </Link>
                        </td>
                        <td className="child-tracker">
                          <span className={`tracker-chip ${(child.tracker ?? "").toLowerCase().replace(" ", "-")}`}>
                            {child.tracker ?? "-"}
                          </span>
                        </td>
                        <td className="child-subject">
                          <Link href={`/issues/${child.id}`} target="_blank" rel="noopener noreferrer">
                            {child.subject}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No child issues.</p>
            )}
          </details>
        </article>

        <article className="report-card">
          <details className="issue-collapsible">
            <summary>
              Attachments <span className="muted">({issue.attachments.length})</span>
            </summary>
            <div className="timeline">
              {issue.attachments.length === 0 && <p className="muted">No attachments.</p>}
              {issue.attachments.map((attachment) => (
                <div key={attachment.id} className="timeline-item timeline-item-attachment">
                  <div className="entry-head">
                    <a href={attachmentUrl(issue.redmineIssueId, attachment.redmineAttachmentId)} target="_blank" rel="noreferrer">
                      {attachment.filename}
                    </a>
                    <span className="muted">{(attachment.filesize / 1024).toFixed(1)} KB</span>
                  </div>
                  {isImageAttachment(attachment) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="attachment-preview-image clickable"
                      src={attachmentUrl(issue.redmineIssueId, attachment.redmineAttachmentId)}
                      alt={attachment.filename}
                      loading="lazy"
                      style={{ maxWidth: "520px", height: "auto", cursor: "zoom-in" }}
                      onClick={() => setLightboxImage({
                        src: attachmentUrl(issue.redmineIssueId, attachment.redmineAttachmentId),
                        alt: attachment.filename,
                      })}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const link = target.parentElement?.querySelector('a');
                        if (link) {
                          link.textContent = `${attachment.filename} (click to view)`;
                        }
                      }}
                    />
                  )}
                  {isPdfAttachment(attachment) && (
                    <iframe
                      className="attachment-preview-pdf"
                      src={attachmentUrl(issue.redmineIssueId, attachment.redmineAttachmentId)}
                      title={`Preview ${attachment.filename}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </details>
        </article>

        <article className="report-card">
          <details className="issue-collapsible">
            <summary>
              GitHub Links
              <span className="muted">({issue.githubLinks.length})</span>
            </summary>
            {actionError && <p className="error-banner">{actionError}</p>}
            {actionInfo && <p className="muted">{actionInfo}</p>}
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
              {issue.githubLinks.length === 0 && <p className="muted">No GitHub links yet.</p>}
              {issue.githubLinks.map((link) => (
                <article key={link.id} className="timeline-item timeline-item-github">
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
                </article>
              ))}
            </div>
          </details>
        </article>

        <article className="report-card comment-card">
          <div className="comment-card-head">
            <div>
              <p className="report-label">Redmine Comment</p>
              <p className="muted">Add a note to this issue in Redmine.</p>
            </div>
          </div>
          {actionError && <p className="error-banner">{actionError}</p>}
          {actionInfo && <p className="info-banner">{actionInfo}</p>}
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
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
          >
            <label>
              Comment
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a Redmine note"
                rows={4}
              />
            </label>
            <button type="submit" disabled={commentBusy || comment.trim().length === 0}>
              {commentBusy ? "Posting..." : "Post to Redmine"}
            </button>
          </form>
        </article>

        <div className="issue-tabs" ref={tabsRef}>
          <Link href={`/issues/${issue.id}?tab=history`} scroll={false} className={activeTab === "history" ? "active" : ""}>
            History
            <span className="tab-count">{historyJournals.length}</span>
          </Link>
          <Link href={`/issues/${issue.id}?tab=notes`} scroll={false} className={activeTab === "notes" ? "active" : ""}>
            Notes
            <span className="tab-count">{noteJournals.length}</span>
          </Link>
          <Link href={`/issues/${issue.id}?tab=internal-notes`} scroll={false} className={activeTab === "internal-notes" ? "active" : ""}>
            Internal Notes
            <span className="tab-count">{internalNotes.length}</span>
          </Link>
          <Link href={`/issues/${issue.id}?tab=properties`} scroll={false} className={activeTab === "properties" ? "active" : ""}>
            Property changes
            <span className="tab-count">{propertyJournals.length}</span>
          </Link>
          <Link href={`/issues/${issue.id}?tab=time_entries`} scroll={false} className={activeTab === "time_entries" ? "active" : ""}>
            Spent time
            <span className="tab-count">{issue.timeEntries.length}</span>
          </Link>
        </div>

        <article className="report-card">
          <p className="report-label">
            {activeTab === "history" && "History"}
            {activeTab === "notes" && "Notes"}
            {activeTab === "properties" && "Property changes"}
            {activeTab === "time_entries" && "Spent time"}
          </p>
          {activeTab === "history" && (
            <div className="timeline">
              {historyJournals.length === 0 && <p className="muted">No history entries yet.</p>}
              {historyJournals.map((journal) => (
                <article key={journal.id} className="timeline-item timeline-item-history">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  <MarkdownBlock
                    content={journal.notes ?? ""}
                    attachments={issue.attachments}
                    issueId={issue.redmineIssueId ?? undefined}
                    onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                  />
                </article>
              ))}
            </div>
          )}
          {activeTab === "notes" && (
            <div className="timeline">
              {noteJournals.length === 0 && <p className="muted">No notes yet.</p>}
              {noteJournals.map((journal) => (
                <article key={journal.id} className="timeline-item timeline-item-note">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  <MarkdownBlock
                    content={journal.notes ?? ""}
                    attachments={issue.attachments}
                    issueId={issue.redmineIssueId ?? undefined}
                    onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                  />
                </article>
              ))}
            </div>
          )}
          {activeTab === "internal-notes" && (
            <div className="internal-notes-section">
              {actionError && <p className="error-banner">{actionError}</p>}
              <form className="form" onSubmit={submitInternalNote}>
                <label>
                  Add Internal Note
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Private note — only visible to your team"
                    rows={3}
                  />
                </label>
                <button type="submit" disabled={noteBusy || newNoteContent.trim().length === 0}>
                  {noteBusy ? "Saving..." : "Add Note"}
                </button>
              </form>
              <div className="internal-notes-list">
                {internalNotes.length === 0 && <p className="muted">No internal notes yet.</p>}
                {internalNotes.map((note) => (
                  <article key={note.id} className="internal-note-item">
                    <div className="internal-note-head">
                      <span className="internal-note-author">{note.authorName}</span>
                      <span className="internal-note-date">{formatAgo(new Date(note.createdAt).toISOString())}</span>
                    </div>
                    <div className="internal-note-content">
                      <MarkdownBlock
                        content={note.content}
                        attachments={issue.attachments}
                        issueId={issue.redmineIssueId ?? undefined}
                        onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                      />
                    </div>
                    <button
                      type="button"
                      className="internal-note-delete"
                      onClick={() => {
                        if (confirm("Delete this internal note?")) {
                          void deleteInternalNote(note.id);
                        }
                      }}
                      title="Delete note"
                    >
                      ✕
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
          {activeTab === "properties" && (
            <div className="timeline">
              {propertyJournals.length === 0 && <p className="muted">No property changes detected.</p>}
              {propertyJournals.map((journal) => (
                <article key={journal.id} className="timeline-item timeline-item-property">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  <MarkdownBlock
                    content={journal.notes ?? ""}
                    attachments={issue.attachments}
                    issueId={issue.redmineIssueId ?? undefined}
                    onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                  />
                </article>
              ))}
            </div>
          )}
          {activeTab === "time_entries" && (
            <div className="time-entries-section">
              <TimeTrackingPanel
                entries={issue.timeEntries.map(e => ({
                  id: e.id,
                  hours: e.hours,
                  comments: e.comments,
                  activityName: e.activityName || "General",
                  spentOn: e.spentOn,
                  authorName: e.authorName || "Unknown",
                }))}
        onAddEntry={async (hours, activityId, comments, spentOn) => {
          await performAction({
            type: "log_time",
            issueId,
            payload: { hours, activityId, comments, spentOn },
            onSuccess: reloadIssue,
            successMessage: "Time entry logged.",
          });
        }}
                activities={activities}
                isLoading={false}
              />
            </div>
          )}
        </article>
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
