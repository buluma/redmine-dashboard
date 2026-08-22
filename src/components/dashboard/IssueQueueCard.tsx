"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { ColumnPicker, type ColumnKey } from "@/src/components/ColumnPicker";
import { ExportButton } from "@/src/components/ExportButton";
import { ProjectFilter } from "@/src/components/ProjectFilter";
import { SkeletonTable } from "@/src/components/SkeletonTable";
import { PAGE_SIZE_OPTIONS } from "@/src/hooks/usePageSize";
import { issueNumericId as toIssueNumericId } from "@/src/lib/issue-utils";
import type { FilterPreset, Issue, StatusCatalog } from "@/src/types/dashboard";
import { IssueQueueRow } from "@/src/components/dashboard/IssueQueueRow";

export interface IssueQueueSummary {
  open: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  stale: number;
  dueToday: number;
  totalVisible: number;
}

export interface PriorityOption {
  id: number;
  name: string;
}

interface IssueQueueCardProps {
  loading: boolean;
  visibleIssues: Issue[];
  issues: Issue[];
  summary: IssueQueueSummary;

  issueQueueOpen: boolean;
  onToggleIssueQueueOpen: () => void;

  selectedIssueIds: number[];
  onClearBulkSelection: () => void;
  statuses: StatusCatalog[];
  bulkStatusId: number;
  onBulkStatusIdChange: (id: number) => void;
  bulkPriorityId: number;
  onBulkPriorityIdChange: (id: number) => void;
  computedPriorityOptions: PriorityOption[];
  bulkUpdating: boolean;
  onUpdateBulkStatus: () => void;
  onUpdateBulkPriority: () => void;
  onUpdateBulkMarkDone: () => void;

  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onResetPage: () => void;

  filterPresets: FilterPreset[];
  savingPreset: boolean;
  presetNameInput: string;
  onPresetNameInputChange: (value: string) => void;
  onStartSavingPreset: () => void;
  onCancelSavingPreset: () => void;
  onConfirmSavingPreset: (snapshot: Omit<FilterPreset, "id" | "name">) => void;
  onApplyPreset: (preset: FilterPreset) => void;

  priorityFilter: string;
  search: string;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (value: boolean) => void;
  assignedToMe: boolean;
  onAssignedToMeChange: (value: boolean) => void;

  onOpenIssueCreateModal: () => void;
  visibleColumns: Set<ColumnKey>;
  onVisibleColumnsChange: (columns: Set<ColumnKey>) => void;
  selectedProject: string | null;
  onSelectedProjectChange: (project: string | null) => void;

  onSelectIssueId: (id: number | null) => void;
  selectedAllVisible: boolean;
  onToggleSelectAllVisible: () => void;
  onSort: (column: string) => void;
  getSortIndicator: (column: string) => string;
  allowedStatusIdsByIssue: Record<number, number[]>;
  selectedIssueId: number | null;

  page: number;
  onPageChange: (updater: number | ((current: number) => number)) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  total: number;

  onOpenInNewTab: (issue: Issue) => void;
  onPrefetchIssue: (routeId: string | number | null | undefined) => void;
  onToggleIssueSelection: (id: number) => void;
  onUpdateStatus: (issue: Issue, statusId: number) => void;
  onLoadAllowedStatuses: (id: number) => void;
  onHoverEnter: (issue: Issue, anchor: HTMLElement) => void;
  onHoverLeave: () => void;
}

export function IssueQueueCard({
  loading,
  visibleIssues,
  issues,
  summary,
  issueQueueOpen,
  onToggleIssueQueueOpen,
  selectedIssueIds,
  onClearBulkSelection,
  statuses,
  bulkStatusId,
  onBulkStatusIdChange,
  bulkPriorityId,
  onBulkPriorityIdChange,
  computedPriorityOptions,
  bulkUpdating,
  onUpdateBulkStatus,
  onUpdateBulkPriority,
  onUpdateBulkMarkDone,
  statusFilter,
  onStatusFilterChange,
  onResetPage,
  filterPresets,
  savingPreset,
  presetNameInput,
  onPresetNameInputChange,
  onStartSavingPreset,
  onCancelSavingPreset,
  onConfirmSavingPreset,
  onApplyPreset,
  priorityFilter,
  search,
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
  assignedToMe,
  onAssignedToMeChange,
  onOpenIssueCreateModal,
  visibleColumns,
  onVisibleColumnsChange,
  selectedProject,
  onSelectedProjectChange,
  onSelectIssueId,
  selectedAllVisible,
  onToggleSelectAllVisible,
  onSort,
  getSortIndicator,
  allowedStatusIdsByIssue,
  selectedIssueId,
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
  onOpenInNewTab,
  onPrefetchIssue,
  onToggleIssueSelection,
  onUpdateStatus,
  onLoadAllowedStatuses,
  onHoverEnter,
  onHoverLeave,
}: IssueQueueCardProps) {
  const { t } = useI18n();

  return (
    <article id="issue-queue" className="card issues-panel">
      <div className="collapsible-head">
        <div>
          <h2>{t('queue.title')}</h2>
          <p className="muted">
            {loading ? t('hero.refreshing') : t('queue.loaded', { count: visibleIssues.length })}
            {summary.open > 0 && <span>{t('queue.openStats', { count: summary.open })}</span>}
            {summary.inProgress > 0 && <span>{t('queue.inProgressStats', { count: summary.inProgress })}</span>}
            {summary.blocked > 0 && <span>{t('queue.blockedStats', { count: summary.blocked })}</span>}
            {summary.overdue > 0 && <span>{t('queue.overdueStats', { count: summary.overdue })}</span>}
          </p>
        </div>
        <div className="queue-actions">
          <span
            className={`queue-stat ${summary.overdue > 0 ? "queue-warn" : ""}`}
            title="Overdue"
            aria-label={`Overdue: ${summary.overdue}`}
          >
            <span aria-hidden="true">⚠️</span> {summary.overdue}
          </span>
          <span
            className={`queue-stat ${summary.blocked > 0 ? "queue-warn" : ""}`}
            title="Blocked"
            aria-label={`Blocked: ${summary.blocked}`}
          >
            <span aria-hidden="true">🛑</span> {summary.blocked}
          </span>
          <span
            className={`queue-stat ${summary.stale > 0 ? "queue-stale" : ""}`}
            title="Stale 3+ days"
            aria-label={`Stale 3+ days: ${summary.stale}`}
          >
            <span aria-hidden="true">🕐</span> {summary.stale}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={onToggleIssueQueueOpen}
            aria-expanded={issueQueueOpen}
            aria-controls="issue-queue-content"
          >
            {issueQueueOpen ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {issueQueueOpen ? (
        <div id="issue-queue-content" className="issue-queue-content">
          {selectedIssueIds.length === 0 ? (
            <p className="muted bulk-toolbar-hint">
              {t('queue.bulkHint', 'Select issues to bulk-edit.')}
              {summary.dueToday > 0 ? ` • Due today: ${summary.dueToday}` : ""}
            </p>
          ) : (
            <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
              <p className="muted">
                Selected: <strong>{selectedIssueIds.length}</strong>
                {summary.dueToday > 0 ? ` • Due today: ${summary.dueToday}` : ""}
              </p>
              <div className="bulk-controls">
                <label className="inline-field">
                  Bulk Status
                  <select value={bulkStatusId} onChange={(e) => onBulkStatusIdChange(Number(e.target.value))}>
                    <option value={0}>—</option>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onUpdateBulkStatus}
                  disabled={bulkUpdating || bulkStatusId <= 0}
                >
                  {bulkUpdating ? "Applying..." : "Apply status"}
                </button>
                <label className="inline-field">
                  Bulk Priority
                  <select value={bulkPriorityId} onChange={(e) => onBulkPriorityIdChange(Number(e.target.value))}>
                    <option value={0}>—</option>
                    {computedPriorityOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onUpdateBulkPriority}
                  disabled={bulkUpdating || bulkPriorityId <= 0}
                >
                  {bulkUpdating ? "Applying..." : "Apply priority"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onUpdateBulkMarkDone}
                  disabled={bulkUpdating}
                  title="Set progress to 100% on all selected"
                >
                  Mark 100%
                </button>
                <button type="button" className="secondary-button" onClick={onClearBulkSelection}>
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="filters-bar filters-bar-compact">
            <div className="quick-filters">
              <button
                type="button"
                className={`quick-filter-btn ${statusFilter === "" ? "active" : ""}`}
                onClick={() => { onStatusFilterChange(""); onResetPage(); }}
              >
                All ({summary.totalVisible})
              </button>
              <button
                type="button"
                className={`quick-filter-btn quick-open ${statusFilter === "Open" ? "active" : ""}`}
                onClick={() => { onStatusFilterChange("Open"); onResetPage(); }}
              >
                <span aria-hidden="true">🟢</span> Open ({summary.open})
              </button>
              <button
                type="button"
                className={`quick-filter-btn quick-progress ${statusFilter.toLowerCase().includes("progress") || statusFilter.toLowerCase().includes("dev") ? "active" : ""}`}
                onClick={() => { onStatusFilterChange("In Progress"); onResetPage(); }}
              >
                <span aria-hidden="true">🔵</span> In Progress ({summary.inProgress})
              </button>
              <button
                type="button"
                className={`quick-filter-btn quick-blocked ${statusFilter.toLowerCase().includes("blocked") ? "active" : ""}`}
                onClick={() => { onStatusFilterChange("Blocked"); onResetPage(); }}
              >
                <span aria-hidden="true">🛑</span> Blocked ({summary.blocked})
              </button>
              {summary.overdue > 0 && (
                <button
                  type="button"
                  className={`quick-filter-btn quick-overdue ${statusFilter === "Overdue" ? "active" : ""}`}
                  onClick={() => { onStatusFilterChange("Overdue"); onResetPage(); }}
                >
                  <span aria-hidden="true">⚠️</span> Overdue ({summary.overdue})
                </button>
              )}
            </div>

            <div className="filters-right">
              {/* Filter Presets */}
              <div className="filter-presets">
                <select
                  className="preset-select"
                  value=""
                  onChange={(e) => {
                    const preset = filterPresets.find((p) => p.id === e.target.value);
                    if (preset) {
                      onApplyPreset(preset);
                    }
                  }}
                >
                  <option value="">{t('queue.presets')}</option>
                  {filterPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="primary-button new-issue-btn"
                  onClick={onOpenIssueCreateModal}
                >
                  + New Issue
                </button>
                <ColumnPicker visibleColumns={visibleColumns} onChange={onVisibleColumnsChange} />
                {savingPreset ? (
                  <div className="preset-name-input-group">
                    <input
                      autoFocus
                      type="text"
                      className="preset-name-input"
                      placeholder="Preset name…"
                      value={presetNameInput}
                      onChange={(e) => onPresetNameInputChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && presetNameInput.trim()) {
                          onConfirmSavingPreset({
                            statusFilter, priorityFilter, search, showFavoritesOnly,
                            assignedToMe,
                          });
                        } else if (e.key === "Escape") {
                          onCancelSavingPreset();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="preset-confirm-btn"
                      disabled={!presetNameInput.trim()}
                      onClick={() => {
                        onConfirmSavingPreset({ statusFilter, priorityFilter, search, showFavoritesOnly });
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="preset-cancel-btn"
                      onClick={onCancelSavingPreset}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="preset-save-btn"
                    onClick={onStartSavingPreset}
                    title="Save current filters as preset"
                  >
                    Save preset
                  </button>
                )}
              </div>
              <ProjectFilter
                issues={issues}
                selectedProject={selectedProject}
                onChange={(project) => {
                  onSelectedProjectChange(project);
                  onResetPage();
                }}
              />
              <button
                type="button"
                className={`favorite-filter ${assignedToMe ? "active" : ""}`}
                onClick={() => {
                  onAssignedToMeChange(!assignedToMe);
                  onResetPage();
                }}
              >
                {assignedToMe ? t('queue.assignedToMeOn') : t('queue.assignedToMeOff')}
              </button>
              <button
                type="button"
                className={`favorite-filter ${showFavoritesOnly ? "active" : ""}`}
                onClick={() => {
                  onShowFavoritesOnlyChange(!showFavoritesOnly);
                  onResetPage();
                }}
              >
                {showFavoritesOnly ? t('queue.favoritesOn') : t('queue.favoritesOff')}
              </button>
              <ExportButton issues={visibleIssues} format="csv" />
              <ExportButton issues={visibleIssues} format="print" />
            </div>
          </div>

          {(
            <>
            <table className="issues-table">
              <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selectedAllVisible}
                    onChange={onToggleSelectAllVisible}
                    aria-label="Select all visible issues"
                  />
                </th>
                <th className="drag-col"></th>
                <th>{t('queue.colId')}</th>
                <th>{t('queue.colSubject')}</th>
                <th>{t('queue.colStatus')}</th>
                {visibleColumns.has("priority") && (
                  <th
                    className="sortable-header"
                    onClick={() => onSort("priority")}
                    style={{ cursor: "pointer" }}
                    title="Sort by priority"
                  >
                    Priority{getSortIndicator("priority")}
                  </th>
                )}
                {visibleColumns.has("due") && (
                  <th
                    className="sortable-header"
                    onClick={() => onSort("due")}
                    style={{ cursor: "pointer" }}
                    title="Sort by due date"
                  >
                    Due{getSortIndicator("due")}
                  </th>
                )}
                {visibleColumns.has("progress") && <th>{t('queue.colProgress')}</th>}
                {visibleColumns.has("updated") && (
                  <th
                    className="sortable-header"
                    onClick={() => onSort("updated")}
                    style={{ cursor: "pointer" }}
                    title="Sort by update time"
                  >
                    {t('drawer.activity')}{getSortIndicator("updated")}
                  </th>
                )}
              </tr>
              </thead>
              <tbody>
              {loading && <SkeletonTable rows={8} columns={6} />}
              {!loading && (() => {
                const filtered = visibleIssues;
                const start = (page - 1) * pageSize;
                const paged = filtered.slice(start, start + pageSize);
                return paged.map((issue) => {
                  const issueNumericId = toIssueNumericId(issue.redmineIssueId);
                  return (
                    <IssueQueueRow
                      key={issue.id}
                      issue={issue}
                      selected={issueNumericId !== null && selectedIssueId === issueNumericId}
                      inBulkSelection={
                        issueNumericId ? selectedIssueIds.includes(issueNumericId) : false
                      }
                      statuses={statuses}
                      allowedStatusIds={
                        issueNumericId ? allowedStatusIdsByIssue[issueNumericId] : undefined
                      }
                      visibleColumns={visibleColumns}
                      onSelect={(id) => onSelectIssueId(id)}
                      onOpenInNewTab={(it) => onOpenInNewTab(it)}
                      onPrefetch={(routeId) => onPrefetchIssue(routeId)}
                      onToggleSelection={(id) => onToggleIssueSelection(id)}
                      onStatusChange={(it, statusId) => onUpdateStatus(it, statusId)}
                      onLoadAllowedStatuses={(id) => onLoadAllowedStatuses(id)}
                      onHoverEnter={(it, anchor) => onHoverEnter(it, anchor)}
                      onHoverLeave={onHoverLeave}
                    />
                  );
                });
              })()}
              </tbody>
            </table>

          {/* Pagination Controls */}
          {(() => {
            const filtered = visibleIssues;
            const filteredTotal = filtered.length;
            const maxPage = Math.max(1, Math.ceil(filteredTotal / pageSize));
            const safePage = Math.min(page, maxPage);
            const showPager = filteredTotal > pageSize;
            if (filteredTotal === 0) return null;
            return (
            <div className="pagination-bar">
              {showPager && (
                <>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { onPageChange(1); }}
                    disabled={safePage === 1}
                    aria-label="First page"
                  >
                    ««
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { onPageChange((p) => Math.max(1, p - 1)); }}
                    disabled={safePage === 1}
                    aria-label="Previous page"
                  >
                    «
                  </button>
                </>
              )}
              <span className="pagination-info">
                {showPager && (
                  <>
                    {t('pagination.pageInfo', { current: safePage, max: maxPage })}
                    {" · "}
                  </>
                )}
                {t('pagination.showing', { start: (safePage - 1) * pageSize + 1, end: Math.min(safePage * pageSize, filteredTotal), total: filteredTotal })}
                {filteredTotal < total ? t('pagination.filtered', { unfilteredTotal: total.toLocaleString() }) : ""}
              </span>
              {showPager && (
                <>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { onPageChange((p) => p + 1); }}
                    disabled={safePage >= maxPage}
                    aria-label="Next page"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => { onPageChange(maxPage); }}
                    disabled={safePage >= maxPage}
                    aria-label="Last page"
                  >
                    »»
                  </button>
                </>
              )}
              <label className="pagination-page-size">
                <span className="muted">{t('pagination.perPage', 'Per page')}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) {
                      onPageSizeChange(n);
                      onPageChange(1);
                    }
                  }}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
            </div>
          );
        })()}
        </>
        )}
        </div>
      ) : (
        <>
          <p className="muted collapsible-meta">
            {t('pagination.queueHidden', { count: visibleIssues.length, loadedCount: visibleIssues.length, selectedCount: selectedIssueIds.length })}
          </p>
        </>
      )}
    </article>
  );
}
