"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { issueDisplayId } from "@/src/lib/issue-utils";
import type { Issue } from "@/src/types/dashboard";

interface AtRiskEntry {
  issue: Issue;
  severity: number;
  reason: string;
}

interface OpsAlertsCardProps {
  atRisk: AtRiskEntry[];
  open: boolean;
  onToggleOpen: () => void;
  onPrefetchIssue: (issue: Issue) => void;
  onOpenIssue: (issue: Issue) => void;
  manualRefreshBusy: boolean;
  onManualPull: () => void;
}

export function OpsAlertsCard({
  atRisk,
  open,
  onToggleOpen,
  onPrefetchIssue,
  onOpenIssue,
  manualRefreshBusy,
  onManualPull,
}: OpsAlertsCardProps) {
  const { t } = useI18n();

  return (
    <article id="ops-alerts" className="card">
      <div className="collapsible-head">
        <div>
          <h2>{t('opsAlerts.title')}</h2>
          <p className="muted">{t('opsAlerts.desc')}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls="ops-alerts-content"
        >
          {open ? t('collapsible.collapse') : t('collapsible.expand')}
        </button>
      </div>

      {open ? (
        <div id="ops-alerts-content" className="alert-list">
          {atRisk.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">✅</span>
              <p className="muted">No active risk alerts.</p>
              <p className="empty-state-hint">
                Nothing overdue, blocked, or stale right now.{" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={onManualPull}
                  disabled={manualRefreshBusy}
                >
                  {manualRefreshBusy ? t('hero.refreshing') : t('hero.forceRefresh')}
                </button>{" "}
                to refresh from Redmine.
              </p>
            </div>
          )}
          {atRisk.map(({ issue, reason }) => (
            <button
              key={issue.id}
              type="button"
              className={`alert-row ${reason.includes("overdue") ? "tone-critical" : reason.includes("blocked") ? "tone-warning" : "tone-stale"}`}
              onMouseEnter={() => onPrefetchIssue(issue)}
              onFocus={() => onPrefetchIssue(issue)}
              onClick={() => onOpenIssue(issue)}
            >
              <span>
                {issueDisplayId(issue)} {issue.subject}
              </span>
              <span>{reason}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted collapsible-meta">{t('opsAlerts.itemCount', { count: atRisk.length })}</p>
      )}
    </article>
  );
}
