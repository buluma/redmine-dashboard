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
  visibleColumns: Set<ColumnKey>;
}

export function IssueQueueRow({
  issue,
  selected,
  inBulkSelection,
  statuses,
  allowedStatusIds,
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
      role="button"
      aria-label={`Open ${issueDisplayId(issue)} ${issue.subject}`}
      onMouseEnter={() => onPrefetch(issueRouteId(issue))}
      onClick={() => {
        // Local tickets have no numeric id for the QuickPeek to fetch;
        // stay guarded like the Enter path below instead of deselecting.
        if (issueNumericId !== null) onSelect(issueNumericId);
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        const tag = target?.tagName;
        if (
          tag === "INPUT" ||
          tag === "SELECT" ||
          tag === "TEXTAREA" ||
          tag === "BUTTON" ||
          tag === "A"
        ) {
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) {
            onOpenInNewTab(issue);
          } else if (issueNumericId) {
            onSelect(issueNumericId);
          }
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          (e.currentTarget.nextElementSibling as HTMLTableRowElement | null)?.focus();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          (e.currentTarget.previousElementSibling as HTMLTableRowElement | null)?.focus();
          return;
        }
        if (e.key === " " && issueNumericId) {
          e.preventDefault();
          onToggleSelection(issueNumericId);
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
          <p>{issue.subject}</p>
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
            disabled={!issueNumericId}
          >
            {selectableStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
          <span
            className={`status-dot ${isOpenStatus(issue.statusName) ? "dot-open" : ""} ${isDoneStatus(issue.statusName) ? "dot-done" : ""} ${isBlockedStatus(issue.statusName) ? "dot-blocked" : ""} ${isInProgressStatus(issue.statusName) ? "dot-progress" : ""}`}
            role="img"
            aria-label={`Status: ${issue.statusName ?? "unknown"}`}
          />
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
