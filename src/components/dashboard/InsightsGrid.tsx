"use client";

import { useI18n } from "@/src/components/I18nProvider";

interface InsightsGridProps {
  topStatuses: [string, number][];
  priorityMix: [string, number][];
  totalVisible: number;
  statusFilter: string;
  onStatusFilterChange: (statusFilter: string) => void;
}

export function InsightsGrid({
  topStatuses,
  priorityMix,
  totalVisible,
  statusFilter,
  onStatusFilterChange,
}: InsightsGridProps) {
  const { t } = useI18n();

  return (
    <section id="summary-insights" className="insights-grid">
      <article className="card">
        <h2>{t('insights.statusMixTitle')}</h2>
        <p className="muted">Click a status to filter quickly.</p>
        <div className="chip-row">
          {topStatuses.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">📊</span>
              <p className="muted">No status data yet.</p>
              <p className="empty-state-hint">
                Connect to Redmine and run a sync to populate the status mix.
              </p>
            </div>
          )}
          {topStatuses.map(([name, count]) => (
            <button
              key={name}
              type="button"
              className={`status-chip ${statusFilter === name ? "active" : ""}`}
              onClick={() => onStatusFilterChange(statusFilter === name ? "" : name)}
            >
              {name} <span>{count}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="card">
        <h2>{t('insights.priorityMixTitle')}</h2>
        <div className="bars-list">
          {priorityMix.length === 0 && (
            <div className="empty-state">
              <span className="empty-state-icon" aria-hidden="true">🎯</span>
              <p className="muted">No priority data yet.</p>
            </div>
          )}
          {priorityMix.map(([name, count]) => (
            <div key={name} className="bar-row">
              <div className="bar-label-row">
                <span>{name}</span>
                <strong>{count}</strong>
              </div>
              <div className="bar-track">
                <span className="bar-fill priority" style={{ width: `${Math.round((count / Math.max(1, totalVisible)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
