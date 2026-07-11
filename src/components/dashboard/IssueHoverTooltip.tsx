"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { issueDisplayId } from "@/src/lib/issue-utils";
import type { Issue } from "@/src/types/dashboard";
import type { HoverPreviewPosition } from "@/src/hooks/useIssueHoverPreview";

interface IssueHoverTooltipProps {
  issue: Issue | null;
  position: HoverPreviewPosition;
}

export function IssueHoverTooltip({ issue, position }: IssueHoverTooltipProps) {
  const { t } = useI18n();

  if (!issue) {
    return null;
  }

  return (
    <div
      className="issue-preview-tooltip"
      role="tooltip"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="preview-header">
        <span className="preview-id">{issueDisplayId(issue)}</span>
        <span className={`priority-badge priority-${(issue.priority ?? "").toLowerCase().replace(/\s+/g, "-")}`}>
          {issue.priority}
        </span>
      </div>
      <p className="preview-subject">{issue.subject}</p>
      <div className="preview-meta">
        <span>{t('preview.status', { name: issue.statusName })}</span>
        <span>{t('preview.progress', { ratio: issue.doneRatio ?? 0 })}</span>
      </div>
      {issue.dueDate && (
        <div className="preview-due">
          {t('preview.due', { date: new Date(issue.dueDate).toLocaleDateString() })}
        </div>
      )}
      {issue.description && (
        <p className="preview-desc">
          {issue.description.slice(0, 200)}
          {issue.description.length > 200 && "..."}
        </p>
      )}
    </div>
  );
}
