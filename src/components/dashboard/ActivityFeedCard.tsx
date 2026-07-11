"use client";

import { useI18n } from "@/src/components/I18nProvider";
import type { ActivityEvent } from "@/src/types/dashboard";

interface ActivityFeedCardProps {
  recentActivity: ActivityEvent[];
  open: boolean;
  onToggleOpen: () => void;
  onPrefetchIssue: (issueId: string) => void;
  onOpenIssue: (issueId: string) => void;
}

export function ActivityFeedCard({
  recentActivity,
  open,
  onToggleOpen,
  onPrefetchIssue,
  onOpenIssue,
}: ActivityFeedCardProps) {
  const { t } = useI18n();

  return (
    <article id="activity-feed" className="card activity-card">
      <div className="collapsible-head">
        <div>
          <h2>{t('activityFeed.title')}</h2>
          <p className="muted">{t('activityFeed.desc', { count: recentActivity.length })}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onToggleOpen}
          aria-expanded={open}
          aria-controls="activity-feed-content"
        >
          {open ? t('collapsible.collapse') : t('collapsible.expand')}
        </button>
      </div>

      {open ? (
        <div id="activity-feed-content" className="activity-feed">
          {recentActivity.map((event, idx) => (
            <button
              key={`${event.issueId}-${event.timestamp}-${idx}`}
              type="button"
              className={`activity-row ${event.detail.includes("logged") ? "tone-time" : event.detail.includes("commented") ? "tone-comment" : "tone-update"}`}
              onMouseEnter={() => onPrefetchIssue(event.issueId)}
              onFocus={() => onPrefetchIssue(event.issueId)}
              onClick={() => onOpenIssue(event.issueId)}
            >
              <span>
                {event.issueLabel} {event.issueSubject}
              </span>
              <span>{event.detail}</span>
              <span>{new Date(event.timestamp).toLocaleString()}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted collapsible-meta">{t('activityFeed.hiddenFeed', { count: recentActivity.length })}</p>
      )}
    </article>
  );
}
