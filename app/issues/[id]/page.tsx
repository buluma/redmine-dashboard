"use client";

import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { normalizeRedmineText } from "@/src/lib/redmine-text-format";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { TimeTrackingPanel } from "@/src/components/TimeTrackingPanel";
import { QuickActionsPanel } from "@/src/components/QuickActionsPanel";

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
  breadcrumbs: Array<{ id: number; subject: string; tracker?: string }>;
  updatedOnRemote: string;
  dueDate: string | null;
  doneRatio: number | null;
  githubLinks: GithubLink[];
  journals: Journal[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  relations: Relation[];
  allowedStatuses: AllowedStatus[];
  children: IssueChild[];
};

function MarkdownBlock({ content, attachments = [], issueId, onImageClick }: { content: string; attachments?: Attachment[]; issueId?: number; onImageClick?: (src: string, alt: string) => void }) {
  const normalized = useMemo(() => normalizeRedmineText(content), [content]);

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

  function CodePre(props: { children?: ReactNode }) {
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
      const attachment = attachments.find(a => a.filename === filename);
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

  return (
    <div className="markdown">
      <ReactMarkdown
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
  return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".gif") || name.endsWith(".webp");
}

function isPdfAttachment(attachment: Attachment): boolean {
  const type = (attachment.contentType ?? "").toLowerCase();
  return type === "application/pdf" || attachment.filename.toLowerCase().endsWith(".pdf");
}

function formatAgo(dateLike: string): string {
  const deltaSec = Math.max(1, Math.floor((Date.now() - new Date(dateLike).getTime()) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type IssueTab = "history" | "notes" | "properties" | "time_entries";

function normalizeTab(raw: string | null): IssueTab {
  if (raw === "notes") return "notes";
  if (raw === "properties") return "properties";
  if (raw === "time_entries") return "time_entries";
  return "history";
}

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const issueId = Number(params.id);
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
  const [transitionStatuses, setTransitionStatuses] = useState<AllowedStatus[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [priorities, setPriorities] = useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const tabsRef = useRef<HTMLDivElement | null>(null);

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
    const res = await fetch(`/api/issues/${issueId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load issue");
    }
    setIssue(data.issue ?? null);
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
      const res = await fetch(`/api/issues/${issueId}/edit`, {
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update issue");
      }
      await reloadIssue();
      setEditMode(false);
      setEditDraft(null);
      setActionInfo("Issue updated in Redmine successfully.");
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
    if (!Number.isInteger(issueId) || issueId <= 0) {
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

  const noteJournals = useMemo(() => {
    if (!issue) return [];
    return issue.journals.filter((journal) => Boolean(journal.notes?.trim()));
  }, [issue]);

  const propertyJournals = useMemo(() => {
    if (!issue) return [];
    const propertySignals = /\b(set to|changed|updated|status|priority|assignee|parent|category)\b/i;
    return issue.journals.filter((journal) => propertySignals.test(journal.notes ?? ""));
  }, [issue]);

  const externalIssueUrl = issue ? redmineIssueUrl(issue) : null;

  if (loading) {
    return <main className="dashboard"><p>Loading issue...</p></main>;
  }

  if (error || !issue) {
    notFound();
  }

  return (
    <main className="dashboard">
      {/* Breadcrumb Navigation */}
      {issue.breadcrumbs && issue.breadcrumbs.length > 0 && (
        <nav className="breadcrumb-nav">
          <Link href="/" className="breadcrumb-item breadcrumb-home">Dashboard</Link>
          <span className="breadcrumb-sep">›</span>
          {issue.breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} className="breadcrumb-chain">
              <Link href={`/issues/${crumb.id}`} className="breadcrumb-item">
                {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                #{crumb.id}: {crumb.subject}
              </Link>
              {i < issue.breadcrumbs.length - 1 && <span className="breadcrumb-sep">›</span>}
            </span>
          ))}
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-item breadcrumb-current">#{issue.redmineIssueId}</span>
        </nav>
      )}
      <header className="card hero issue-hero">
        <div className="hero-top">
          <div className="issue-heading">
            <p className="kicker">{issue.tracker ?? "Issue"}</p>
            <div className="issue-title-line">
              {externalIssueUrl ? (
                <a className="redmine-issue-link" href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                  #{issue.redmineIssueId}
                </a>
              ) : (
                <span className="redmine-issue-link muted">#{issue.redmineIssueId}</span>
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
              {issue.projectName ?? "No project"} • Updated {formatAgo(issue.updatedOnRemote)}
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
          </div>
          <div className="hero-actions">
            {!editMode && (
              <button type="button" className="primary-link" onClick={startEditMode}>
                Edit
              </button>
            )}
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      {/* Quick Actions Panel */}
      <QuickActionsPanel
        issueId={issue.redmineIssueId}
        currentStatus={issue.statusName}
        currentAssignee={issue.assignedToName ?? undefined}
        onStatusChange={async (statusId) => {
          try {
            const res = await fetch(`/api/issues/${issueId}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ statusId }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Failed to update status");
            }
            await reloadIssue();
            setActionInfo("Status updated in Redmine.");
          } catch (e) {
            setActionError(e instanceof Error ? e.message : "Failed to update status");
          }
        }}
        onAssign={async (userId) => {
          try {
            const res = await fetch(`/api/issues/${issueId}/assign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Failed to assign issue");
            }
            await reloadIssue();
          } catch (e) {
            setActionError(e instanceof Error ? e.message : "Failed to assign issue");
          }
        }}
        onAddTime={async (hours, comment) => {
          try {
            const res = await fetch(`/api/issues/${issueId}/timelog`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ hours, comments: comment }),
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Failed to add time entry");
            }
            await reloadIssue();
          } catch (e) {
            setActionError(e instanceof Error ? e.message : "Failed to add time entry");
          }
        }}
        statuses={transitionStatuses}
        users={users}
      />

      <section className="card reports-shell">
        <div className="reports-head">
          <div>
            <h2>Issue Overview</h2>
            <p className="muted">Core fields and delivery snapshot for this issue.</p>
          </div>
        </div>

        <div className="reports-grid issue-overview-grid">
          <article className="report-card">
            <p className="report-label">Status</p>
            <p className="report-value">{issue.statusName}</p>
            <p className="report-foot">Priority: {issue.priority ?? "-"}</p>
          </article>
          <article className="report-card">
            <p className="report-label">Due Date</p>
            <p className="report-value">{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</p>
            <p className="report-foot">% Done: {issue.doneRatio ?? 0}%</p>
          </article>
          <article className="report-card">
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
            <MarkdownBlock content={issue.description} attachments={issue.attachments} issueId={issue.redmineIssueId} onImageClick={(src, alt) => setLightboxImage({ src, alt })} />
          ) : (
            <p className="muted">No description.</p>
          )}
        </article>

        {/* Issue Metadata Section */}
        {(issue.authorName || issue.categoryName || issue.startDate || issue.estimatedHours || issue.spentHours || (issue.customFieldsJson && issue.customFieldsJson.length > 0)) && (
          <article className="report-card issue-metadata-card">
            <div className="metadata-head-row">
              <h3>Issue Metadata</h3>
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
            </div>
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
                      const matchedUser = users.find((u) => u.id === assigneeUserId);
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
          </article>
        )}

        {aiStatus?.available && (
          <AiIssueActions issueId={issue.id} />
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
                          <Link href={`/issues/${child.id}`} className="child-issue-link">
                            #{child.id}
                          </Link>
                        </td>
                        <td className="child-tracker">
                          <span className={`tracker-chip ${(child.tracker ?? "").toLowerCase().replace(" ", "-")}`}>
                            {child.tracker ?? "-"}
                          </span>
                        </td>
                        <td className="child-subject">
                          <Link href={`/issues/${child.id}`}>
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
                <div key={attachment.id} className="timeline-item">
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
                <article key={link.id} className="timeline-item">
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
          <form className="form" onSubmit={submitComment}>
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
          <Link href={`/issues/${issue.redmineIssueId}?tab=history`} scroll={false} className={activeTab === "history" ? "active" : ""}>
            History
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=notes`} scroll={false} className={activeTab === "notes" ? "active" : ""}>
            Notes
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=properties`} scroll={false} className={activeTab === "properties" ? "active" : ""}>
            Property changes
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=time_entries`} scroll={false} className={activeTab === "time_entries" ? "active" : ""}>
            Spent time
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
              {issue.journals.length === 0 && <p className="muted">No history entries yet.</p>}
              {issue.journals.map((journal) => (
                <article key={journal.id} className="timeline-item">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  {journal.notes ? (
                    <MarkdownBlock
                      content={journal.notes}
                      attachments={issue.attachments}
                      issueId={issue.redmineIssueId}
                      onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                    />
                  ) : <p>(empty note)</p>}
                </article>
              ))}
            </div>
          )}
          {activeTab === "notes" && (
            <div className="timeline">
              {noteJournals.length === 0 && <p className="muted">No notes yet.</p>}
              {noteJournals.map((journal) => (
                <article key={journal.id} className="timeline-item">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  <MarkdownBlock
                    content={journal.notes ?? ""}
                    attachments={issue.attachments}
                    issueId={issue.redmineIssueId}
                    onImageClick={(src, alt) => setLightboxImage({ src, alt })}
                  />
                </article>
              ))}
            </div>
          )}
          {activeTab === "properties" && (
            <div className="timeline">
              {propertyJournals.length === 0 && <p className="muted">No property changes detected.</p>}
              {propertyJournals.map((journal) => (
                <article key={journal.id} className="timeline-item">
                  <p className="muted">
                    <strong>{journal.author ?? "Unknown"}</strong> • {formatAgo(journal.createdOnRemote)}
                  </p>
                  <MarkdownBlock
                    content={journal.notes ?? ""}
                    attachments={issue.attachments}
                    issueId={issue.redmineIssueId}
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
                  try {
                    const res = await fetch(`/api/issues/${issueId}/timelog`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ hours, activityId, comments, spentOn }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.error || "Failed to add time entry");
                    }
                    await reloadIssue();
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : "Failed to add time entry");
                  }
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
    </main>
  );
}
