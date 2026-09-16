"use client";

import {
  issueDisplayId,
  issueNumericId as toIssueNumericId,
  issueRouteId,
  issueUrgency,
  isOpenStatus,
  isInProgressStatus,
  isDoneStatus,
  isBlockedStatus,
  latestIssueActivityTimestamp,
  redmineIssueUrl,
} from "@/src/lib/issue-utils";
import type { Issue, StatusCatalog } from "@/src/types/dashboard";

import type { ColumnKey } from "@/src/components/ColumnPicker";

export interface IssueQueueRowCallbacks {
  onSelect: (issueId: number) => void;
  onOpenInNewTab: (issue: Issue) => void;
  onPrefetch: (routeId: string) => void;
  onToggleSelection: (issueNumericId: number) => void;
  onStatusChange: (issue: Issue, statusId: number) => void;
  onLoadAllowedStatuses: (issueNumericId: number) => void;
  onHoverEnter: (issue: Issue, anchor: HTMLElement) => void;
  onHoverLeave: () => void;
}

interface IssueQueueRowProps extends IssueQueueRowCallbacks {
  issue: Issue;
  selected: boolean;
  inBulkSelection: boolean;
  statuses: StatusCatalog[];
  allowedStatusIds?: number[];
  statusUpdating?: boolean;
  visibleColumns: Set<ColumnKey>;
}

export function IssueQueueRow({
  issue,
  selected,
  inBulkSelection,
  statuses,
  allowedStatusIds,
  statusUpdating = false,
  visibleColumns,
  onSelect,
  onOpenInNewTab,
  onPrefetch,
  onToggleSelection,
  onStatusChange,
  onLoadAllowedStatuses,
  onHoverEnter,
  onHoverLeave,
}: IssueQueueRowProps) {
  const urgency = issueUrgency(issue);
  const issueNumericId = toIssueNumericId(issue.redmineIssueId);
  const selectableStatuses =
    allowedStatusIds && allowedStatusIds.length > 0
      ? statuses.filter((s) => allowedStatusIds.includes(s.id))
      : statuses;

  return (
    <tr
      className={`issue-row ${selected ? "selected" : ""}`}
      tabIndex={0}
      onMouseEnter={() => onPrefetch(issueRouteId(issue))}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(target.tagName)) return;
        if (event.key === "Enter") {
          event.preventDefault();
          if (event.shiftKey) onOpenInNewTab(issue);
          else if (issueNumericId !== null) onSelect(issueNumericId);
        } else if (event.key === " ") {
          event.preventDefault();
          if (issueNumericId !== null) onToggleSelection(issueNumericId);
        }
      }}
    >
      <td onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={inBulkSelection}
          onChange={() => {
            if (issueNumericId) onToggleSelection(issueNumericId);
          }}
          aria-label={`Select issue ${issueDisplayId(issue)}`}
          disabled={!issueNumericId}
        />
      </td>
      <td className="drag-handle" title="Drag to reorder">
        ⋮⋮
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {redmineIssueUrl(issue) ? (
          <a
            className="redmine-issue-link compact"
            href={redmineIssueUrl(issue) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            {issueDisplayId(issue)}
          </a>
        ) : (
          <span>{issueDisplayId(issue)}</span>
        )}
      </td>
      <td
        onMouseEnter={(e) => onHoverEnter(issue, e.currentTarget)}
        onMouseLeave={onHoverLeave}
        onFocus={(e) => onHoverEnter(issue, e.currentTarget)}
        onBlur={onHoverLeave}
      >
        <div className="subject-cell">
          <button
            type="button"
            className="issue-subject-button"
            onClick={() => issueNumericId !== null && onSelect(issueNumericId)}
            disabled={issueNumericId === null}
            aria-label={`Open ${issueDisplayId(issue)} ${issue.subject}`}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                onOpenInNewTab(issue);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (issueNumericId !== null) onSelect(issueNumericId);
              } else if (event.key === " ") {
                event.preventDefault();
                if (issueNumericId !== null) onToggleSelection(issueNumericId);
              }
            }}
          >
            {issue.subject}
          </button>
          {issue.githubLinks.length > 0 && (
            <span className="subject-meta">GH: {issue.githubLinks.length} link(s)</span>
          )}
          {issue.attachments.length > 0 && (
            <span className="subject-meta">Attachments: {issue.attachments.length}</span>
          )}
          {issue.relations.length > 0 && (
            <span className="subject-meta">Relations: {issue.relations.length}</span>
          )}
          <span className={`urgency-pill ${urgency}`} aria-label={`Urgency: ${urgency}`}>
            {urgency}
          </span>
        </div>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <div className="status-cell">
          <select
            className="status-select"
            value={issue.statusId}
            onChange={(e) => onStatusChange(issue, Number(e.target.value))}
            onFocus={() => {
              if (issueNumericId) onLoadAllowedStatuses(issueNumericId);
            }}
            disabled={!issueNumericId || statusUpdating}
            aria-busy={statusUpdating}
            aria-label={statusUpdating ? `Saving status for ${issueDisplayId(issue)}` : `Status for ${issueDisplayId(issue)}`}
          >
            {selectableStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          {statusUpdating && <span className="status-saving" role="status">Saving…</span>}
          <span
            className={`status-dot ${isOpenStatus(issue.statusName) ? "dot-open" : ""} ${isDoneStatus(issue.statusName) ? "dot-done" : ""} ${isBlockedStatus(issue.statusName) ? "dot-blocked" : ""} ${isInProgressStatus(issue.statusName) ? "dot-progress" : ""}`}
            role="img"
            aria-label={`Status: ${issue.statusName ?? "unknown"}`}
          />
          {isBlockedStatus(issue.statusName) && (
            // The Blocked quick-filter bucket also catches "on hold"/"waiting"
            // statuses (see isBlockedStatus), which don't say "blocked"
            // anywhere on the status pill itself — this makes that visible.
            <span className="blocked-pill" title={`Counted as blocked: status is "${issue.statusName}"`}>
              blocked
            </span>
          )}
        </div>
      </td>
      {visibleColumns.has("priority") && (
        <td>
          <span
            className={`priority-badge priority-${(issue.priority ?? "").toLowerCase().replace(/\s+/g, "-")}`}
          >
            {issue.priority ?? "-"}
          </span>
        </td>
      )}
      {visibleColumns.has("due") && (
        <td className={urgency === "overdue" ? "due-overdue" : urgency === "soon" ? "due-soon" : ""}>
          {issue.dueDate ? (
            <span className={`due-badge ${urgency}`}>
              {new Date(issue.dueDate).toLocaleDateString()}
              {urgency === "overdue" && <span aria-hidden="true"> ⚠️</span>}
              {urgency === "soon" && <span aria-hidden="true"> ⏰</span>}
            </span>
          ) : (
            "-"
          )}
        </td>
      )}
      {visibleColumns.has("progress") && <td>{issue.doneRatio ?? 0}%</td>}
      {visibleColumns.has("updated") && (
        <td>{new Date(latestIssueActivityTimestamp(issue)).toLocaleString()}</td>
      )}
    </tr>
  );
}
