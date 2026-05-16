"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownBlock } from "@/src/components/MarkdownBlock";
import { redmineIssueUrl, issueDisplayId, dueInDays } from "@/src/lib/issue-utils";
import type { Issue } from "@/src/types/dashboard";

type Props = {
  issueId: number | null;
  onClose: () => void;
  onOpenFullPage: (issue: Issue) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

export function IssueQuickPeek({ issueId, onClose, onOpenFullPage, onPrev, onNext, hasPrev, hasNext }: Props) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const prevIssueId = useRef<number | null>(null);

  useEffect(() => {
    if (!issueId) {
      setIssue(null);
      setError(null);
      return;
    }
    if (issueId === prevIssueId.current && issue) return;
    prevIssueId.current = issueId;

    setLoading(true);
    setError(null);
    fetch(`/api/issues/${issueId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.issue) setIssue(data.issue as Issue);
        else setError("Issue not found");
      })
      .catch(() => setError("Failed to load issue"))
      .finally(() => setLoading(false));
  }, [issueId, issue]);

  useEffect(() => {
    if (!issueId) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "Escape") { onClose(); return; }
      if ((e.key === "j" || e.key === "ArrowDown") && hasNext && onNext) { e.preventDefault(); onNext(); return; }
      if ((e.key === "k" || e.key === "ArrowUp") && hasPrev && onPrev) { e.preventDefault(); onPrev(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issueId, onClose, onNext, onPrev, hasNext, hasPrev]);

  useEffect(() => {
    if (issueId) {
      panelRef.current?.focus();
    }
  }, [issueId]);

  if (!issueId) return null;

  const due = issue ? dueInDays(issue.dueDate) : null;
  const dueBadge =
    due === null ? null :
    due < 0 ? <span className="peek-badge badge-overdue">Overdue {Math.abs(due)}d</span> :
    due === 0 ? <span className="peek-badge badge-today">Due today</span> :
    due <= 3 ? <span className="peek-badge badge-soon">Due in {due}d</span> : null;

  const recentJournals = issue?.journals
    .filter((j) => j.notes?.trim())
    .slice(-3)
    .reverse() ?? [];

  return (
    <>
      <div className="peek-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className="peek-panel"
        tabIndex={-1}
        role="complementary"
        aria-label="Issue quick peek"
      >
        <div className="peek-header">
          <div className="peek-header-meta">
            {issue && (
              <span className="peek-issue-id">{issueDisplayId(issue)}</span>
            )}
            {issue?.projectName && (
              <span className="peek-project">{issue.projectName}</span>
            )}
          </div>
          <div className="peek-header-actions">
            {(onPrev || onNext) && (
              <div className="peek-nav" role="group" aria-label="Navigate issues">
                <button
                  type="button"
                  className="peek-nav-btn"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  aria-label="Previous issue (k)"
                  title="Previous (k / ↑)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="peek-nav-btn"
                  onClick={onNext}
                  disabled={!hasNext}
                  aria-label="Next issue (j)"
                  title="Next (j / ↓)"
                >
                  ↓
                </button>
              </div>
            )}
            {issue && (
              <button
                type="button"
                className="secondary-button peek-fullpage-btn"
                onClick={() => onOpenFullPage(issue)}
                title="Open full page"
              >
                ↗ Full page
              </button>
            )}
            <button
              type="button"
              className="peek-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="peek-body">
          {loading && (
            <div className="peek-loading">
              <span className="peek-spinner" />
              <span>Loading…</span>
            </div>
          )}

          {error && !loading && (
            <p className="peek-error">{error}</p>
          )}

          {issue && !loading && (
            <>
              <h2 className="peek-subject">{issue.subject}</h2>

              <div className="peek-chips">
                <span className="peek-chip chip-status">{issue.statusName}</span>
                {issue.priority && (
                  <span className="peek-chip chip-priority">{issue.priority}</span>
                )}
                {issue.tracker && (
                  <span className="peek-chip chip-tracker">{issue.tracker}</span>
                )}
                {dueBadge}
              </div>

              <dl className="peek-meta-grid">
                {issue.assignedToName && (
                  <>
                    <dt>Assigned</dt>
                    <dd>{issue.assignedToName}</dd>
                  </>
                )}
                {issue.dueDate && (
                  <>
                    <dt>Due</dt>
                    <dd>{new Date(issue.dueDate).toLocaleDateString()}</dd>
                  </>
                )}
                {issue.estimatedHours != null && (
                  <>
                    <dt>Estimate</dt>
                    <dd>{issue.estimatedHours}h</dd>
                  </>
                )}
                {issue.doneRatio != null && (
                  <>
                    <dt>Progress</dt>
                    <dd>
                      <div className="peek-progress-track">
                        <span className="peek-progress-fill" style={{ width: `${issue.doneRatio}%` }} />
                      </div>
                      <span className="peek-progress-label">{issue.doneRatio}%</span>
                    </dd>
                  </>
                )}
              </dl>

              {issue.description && (
                <section className="peek-section">
                  <h3 className="peek-section-title">Description</h3>
                  <div className="peek-description">
                    <MarkdownBlock
                      content={issue.description}
                      attachments={issue.attachments}
                      issueId={issue.redmineIssueId}
                    />
                  </div>
                </section>
              )}

              {recentJournals.length > 0 && (
                <section className="peek-section">
                  <h3 className="peek-section-title">
                    Recent comments
                    {issue.journals.filter((j) => j.notes?.trim()).length > 3 && (
                      <span className="peek-section-more">
                        {issue.journals.filter((j) => j.notes?.trim()).length - 3} more on full page
                      </span>
                    )}
                  </h3>
                  <div className="peek-journal-list">
                    {recentJournals.map((j) => (
                      <div key={j.id} className="peek-journal-item">
                        <p className="peek-journal-meta">
                          <strong>{j.author ?? "Unknown"}</strong>
                          <span>{new Date(j.createdOnRemote).toLocaleString()}</span>
                        </p>
                        <MarkdownBlock
                          content={j.notes ?? ""}
                          attachments={issue.attachments}
                          issueId={issue.redmineIssueId}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {issue.githubLinks.length > 0 && (
                <section className="peek-section">
                  <h3 className="peek-section-title">GitHub links</h3>
                  <ul className="peek-gh-list">
                    {issue.githubLinks.map((link) => (
                      <li key={link.id}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.title ?? link.repositoryFullName}
                          {link.githubPrNumber ? ` #PR-${link.githubPrNumber}` : ""}
                          {link.githubIssueNumber ? ` #${link.githubIssueNumber}` : ""}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {redmineIssueUrl(issue) && (
                <div className="peek-footer">
                  <a
                    href={redmineIssueUrl(issue) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="peek-redmine-link"
                  >
                    View in Redmine ↗
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
