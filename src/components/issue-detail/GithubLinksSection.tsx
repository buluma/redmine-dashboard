"use client";

import { useState } from "react";

import { useI18n } from "@/src/components/I18nProvider";

export interface GithubLink {
  id: string;
  repositoryFullName: string;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  url: string;
  title: string | null;
  createdAt: string;
}

export interface GithubLinkCreatePayload {
  repositoryFullName: string;
  githubIssueNumber?: number;
  githubPrNumber?: number;
  url?: string;
  title?: string;
}

interface GithubLinksSectionProps {
  links: GithubLink[];
  busy: boolean;
  actionError?: string | null;
  actionInfo?: string | null;
  onCreate: (payload: GithubLinkCreatePayload) => Promise<boolean>;
  onDelete: (linkId: string) => Promise<void>;
}

export function GithubLinksSection({
  links,
  busy,
  actionError,
  actionInfo,
  onCreate,
  onDelete,
}: GithubLinksSectionProps) {
  const { t } = useI18n();
  const [repo, setRepo] = useState("");
  const [issueNo, setIssueNo] = useState("");
  const [prNo, setPrNo] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const issueNoTrim = issueNo.trim();
    const prNoTrim = prNo.trim();
    const ok = await onCreate({
      repositoryFullName: repo.trim(),
      githubIssueNumber: issueNoTrim ? Number(issueNoTrim) : undefined,
      githubPrNumber: prNoTrim ? Number(prNoTrim) : undefined,
      url: url.trim() || undefined,
      title: title.trim() || undefined,
    });
    if (ok) {
      setIssueNo("");
      setPrNo("");
      setUrl("");
      setTitle("");
    }
  }

  return (
    <article className="report-card">
      <details className="issue-collapsible">
        <summary>
          {t("issues.sections.github")}
          <span className="muted">({links.length})</span>
        </summary>
        {actionError && <p className="error-banner">{actionError}</p>}
        {actionInfo && <p className="muted">{actionInfo}</p>}
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Repository (`owner/repo`)
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
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
              value={issueNo}
              onChange={(e) => setIssueNo(e.target.value)}
              placeholder="123"
            />
          </label>
          <label>
            GitHub PR #
            <input
              type="number"
              min="1"
              step="1"
              value={prNo}
              onChange={(e) => setPrNo(e.target.value)}
              placeholder="456"
            />
          </label>
          <label>
            Direct URL (optional)
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/acme/platform/issues/123"
            />
          </label>
          <label>
            {t("issues.fields.titleLabel")} (optional)
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Investigate API timeout"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t("common.loading") : t("issues.actions.linkGithub")}
          </button>
        </form>

        <div className="timeline">
          {links.length === 0 && <p className="muted">{t("issues.empty.github")}</p>}
          {links.map((link) => (
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
                  onClick={() => void onDelete(link.id)}
                  disabled={busy}
                >
                  {t("issues.actions.delete")}
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
  );
}
