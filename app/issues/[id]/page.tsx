"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { normalizeRedmineText } from "@/src/lib/redmine-text-format";

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
};

type Issue = {
  id: string;
  redmineIssueId: number;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  updatedOnRemote: string;
  dueDate: string | null;
  doneRatio: number | null;
  githubLinks: GithubLink[];
  journals: Journal[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  relations: Relation[];
  children: IssueChild[];
};

function MarkdownBlock({ content }: { content: string }) {
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

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{ pre: CodePre }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function attachmentUrl(issueId: number, attachmentId: number): string {
  return `/api/issues/${issueId}/attachments/${attachmentId}`;
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
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const totalSpent = useMemo(() => {
    if (!issue) return 0;
    return issue.timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  }, [issue]);

  const noteJournals = useMemo(() => {
    if (!issue) return [];
    return issue.journals.filter((journal) => Boolean(journal.notes?.trim()));
  }, [issue]);

  const propertyJournals = useMemo(() => {
    if (!issue) return [];
    const propertySignals = /\b(set to|changed|updated|status|priority|assignee|parent|category)\b/i;
    return issue.journals.filter((journal) => propertySignals.test(journal.notes ?? ""));
  }, [issue]);

  if (loading) {
    return <main className="dashboard"><p>Loading issue...</p></main>;
  }

  if (error || !issue) {
    return (
      <main className="dashboard">
        <p className="error-banner">{error ?? "Issue not found"}</p>
        <p><Link href="/" className="primary-link">Back to dashboard</Link></p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{issue.tracker ?? "Issue"} #{issue.redmineIssueId}</p>
            <h1>{issue.subject}</h1>
            <p className="muted">
              {issue.projectName ?? "No project"} • Updated {formatAgo(issue.updatedOnRemote)}
            </p>
            <div className="chip-row">
              <span className="status-chip active">{issue.statusName}</span>
              <span className="status-chip">{issue.priority ?? "No priority"}</span>
              <span className="status-chip">{issue.assignedToName ?? "Unassigned"}</span>
            </div>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

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

        <article className="report-card">
          <p className="report-label">Description</p>
          {issue.description ? <MarkdownBlock content={issue.description} /> : <p className="muted">No description.</p>}
        </article>

        <article className="report-card">
          <p className="report-label">Attachments</p>
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
                  <Image
                    className="attachment-preview-image"
                    src={attachmentUrl(issue.redmineIssueId, attachment.redmineAttachmentId)}
                    alt={attachment.filename}
                    width={520}
                    height={240}
                    loading="lazy"
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
        </article>

        <div className="issue-tabs">
          <Link href={`/issues/${issue.redmineIssueId}?tab=history`} className={activeTab === "history" ? "active" : ""}>
            History
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=notes`} className={activeTab === "notes" ? "active" : ""}>
            Notes
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=properties`} className={activeTab === "properties" ? "active" : ""}>
            Property changes
          </Link>
          <Link href={`/issues/${issue.redmineIssueId}?tab=time_entries`} className={activeTab === "time_entries" ? "active" : ""}>
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
                  {journal.notes ? <MarkdownBlock content={journal.notes} /> : <p>(empty note)</p>}
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
                  <MarkdownBlock content={journal.notes ?? ""} />
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
                  <MarkdownBlock content={journal.notes ?? ""} />
                </article>
              ))}
            </div>
          )}
          {activeTab === "time_entries" && (
            <div className="timeline">
              {issue.timeEntries.length === 0 && <p className="muted">No spent time entries yet.</p>}
              {issue.timeEntries.map((entry) => (
                <article key={entry.id} className="timeline-item">
                  <p className="muted">
                    <strong>{entry.authorName ?? "Unknown"}</strong> • {new Date(entry.spentOn).toLocaleDateString()}
                  </p>
                  <p>
                    <strong>Spent time:</strong> {entry.hours.toFixed(1)}h
                    {entry.activityName ? ` • ${entry.activityName}` : ""}
                  </p>
                  {entry.comments ? <MarkdownBlock content={entry.comments} /> : null}
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
