"use client";

import type { RefObject } from "react";

import { useI18n } from "@/src/components/I18nProvider";
import { SavedViewsPanel } from "@/src/components/SavedViewsPanel";
import { AdvancedFilters, type FilterState } from "@/src/components/AdvancedFilters";
import type { SavedView, StatusCatalog } from "@/src/types/dashboard";

export type SearchMode = "local" | "hybrid" | "fts";

interface DashboardFiltersPanelProps {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statuses: StatusCatalog[];
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  priorities: string[];
  sort: string;
  onSortChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchMode: SearchMode;
  onSearchModeChange: (value: SearchMode) => void;
  onResetPage: () => void;
  savedViews: SavedView[];
  activeViewId: string | null;
  onApplySavedView: (view: SavedView) => void;
  onDeleteSavedView: (viewId: string) => void;
  onReorderSavedViews: (viewIds: string[]) => void;
  onSaveCurrentView: () => void;
  viewDraftName: string;
  setViewDraftName: (name: string) => void;
  aiSearchOpen: boolean;
  aiAvailable: boolean;
  onToggleAiSearch: () => void;
  onOpenFtsSearch: () => void;
  advancedFilters?: FilterState;
  onAdvancedFiltersChange?: (filters: FilterState) => void;
  onClearAdvancedFilters?: () => void;
  advancedPriorities?: { id: number; name: string }[];
}

export function DashboardFiltersPanel({
  statusFilter,
  onStatusFilterChange,
  statuses,
  priorityFilter,
  onPriorityFilterChange,
  priorities,
  sort,
  onSortChange,
  search,
  onSearchChange,
  searchInputRef,
  searchMode,
  onSearchModeChange,
  onResetPage,
  savedViews,
  activeViewId,
  onApplySavedView,
  onDeleteSavedView,
  onReorderSavedViews,
  onSaveCurrentView,
  viewDraftName,
  setViewDraftName,
  aiSearchOpen,
  aiAvailable,
  onToggleAiSearch,
  onOpenFtsSearch,
  advancedFilters = { search: "", statusIds: [], priorityIds: [], assignedToMe: false, hasGithubLinks: false, hasAttachments: false },
  onAdvancedFiltersChange = () => undefined,
  onClearAdvancedFilters = () => undefined,
  advancedPriorities = [],
}: DashboardFiltersPanelProps) {
  const { t } = useI18n();
  const activeFilters: { key: string; label: string; remove: () => void }[] = [];
  if (statusFilter) activeFilters.push({ key: "status", label: `${t("filters.status")}: ${statusFilter}`, remove: () => onStatusFilterChange("") });
  if (priorityFilter) activeFilters.push({ key: "priority", label: `${t("filters.priority")}: ${priorityFilter}`, remove: () => onPriorityFilterChange("") });
  if (search) activeFilters.push({ key: "search", label: `${t("filters.search")}: ${search}`, remove: () => onSearchChange("") });
  if (advancedFilters.statusIds.length > 0) activeFilters.push({ key: "advanced-status", label: `${t("filters.status")}: ${advancedFilters.statusIds.length}`, remove: () => onAdvancedFiltersChange({ ...advancedFilters, statusIds: [] }) });
  if (advancedFilters.priorityIds.length > 0) activeFilters.push({ key: "advanced-priority", label: `${t("filters.priority")}: ${advancedFilters.priorityIds.length}`, remove: () => onAdvancedFiltersChange({ ...advancedFilters, priorityIds: [] }) });
  if (advancedFilters.hasGithubLinks) activeFilters.push({ key: "github", label: t("filters.githubLinks", "GitHub links"), remove: () => onAdvancedFiltersChange({ ...advancedFilters, hasGithubLinks: false }) });
  if (advancedFilters.hasAttachments) activeFilters.push({ key: "attachments", label: t("issues.attachments", "Attachments"), remove: () => onAdvancedFiltersChange({ ...advancedFilters, hasAttachments: false }) });
  if (advancedFilters.dueInDays !== undefined) activeFilters.push({ key: "due", label: t("issues.dueDate", "Due date"), remove: () => onAdvancedFiltersChange({ ...advancedFilters, dueInDays: undefined }) });
  if (advancedFilters.updatedAfter) activeFilters.push({ key: "updated", label: `${t("filters.updatedAfter", "Updated after")}: ${advancedFilters.updatedAfter}`, remove: () => onAdvancedFiltersChange({ ...advancedFilters, updatedAfter: undefined }) });

  return (
    <section className="card filters-panel">
      <div className="filters-grid home-filters-grid">
        <label className="filter-field">
          {t('filters.status')}
          <select value={statusFilter} onChange={(e) => { onStatusFilterChange(e.target.value); onResetPage(); }}>
            <option value="">{t('filters.allStatuses')}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          {t('filters.priority')}
          <select value={priorityFilter} onChange={(e) => { onPriorityFilterChange(e.target.value); onResetPage(); }}>
            <option value="">{t('filters.allPriorities')}</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          {t('filters.sort')}
          <select value={sort} onChange={(e) => onSortChange(e.target.value)}>
            <option value="updated_desc">{t('filters.sortNewest')}</option>
            <option value="updated_asc">{t('filters.sortOldest')}</option>
            <option value="priority">{t('filters.sortPriority')}</option>
            <option value="due_date">{t('filters.sortDueDate')}</option>
          </select>
        </label>

        <label className="filter-field search-field">
          {t('filters.search')}
          <input
            ref={searchInputRef}
            placeholder={t('filters.searchPlaceholder')}
            value={search}
            onChange={(e) => { onSearchChange(e.target.value); onResetPage(); }}
          />
        </label>

        <label className="filter-field">
          {t('filters.searchSource')}
          <select value={searchMode} onChange={(e) => onSearchModeChange(e.target.value as SearchMode)}>
            <option value="local">{t('filters.sourceLocal')}</option>
            <option value="hybrid">{t('filters.sourceHybrid')}</option>
            <option value="fts">{t('filters.sourceFts')}</option>
          </select>
          <span className="muted">{t('filters.mode' + (searchMode === "local" ? "Local" : searchMode === "fts" ? "Fts" : "Hybrid"))}</span>
        </label>
      </div>

      <AdvancedFilters
        filters={advancedFilters}
        onChange={(next) => { onAdvancedFiltersChange(next); onResetPage(); }}
        statuses={statuses}
        priorities={advancedPriorities}
        onClear={onClearAdvancedFilters}
      />

      {activeFilters.length > 0 && (
        <div className="active-filter-summary" aria-label={t("filters.active", "Active filters")}>
          <span className="muted">{t("filters.active", "Active filters")}:</span>
          {activeFilters.map((filter) => (
            <button key={filter.key} type="button" className="active-filter-chip" onClick={() => { filter.remove(); onResetPage(); }}>
              {filter.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="link-button active-filter-clear" onClick={() => { onStatusFilterChange(""); onPriorityFilterChange(""); onSearchChange(""); onClearAdvancedFilters(); onResetPage(); }}>
            {t("common.clearFilters", "Clear all")}
          </button>
        </div>
      )}

      <SavedViewsPanel
        savedViews={savedViews}
        activeViewId={activeViewId}
        onApply={(view) => onApplySavedView(view as SavedView)}
        onDelete={onDeleteSavedView}
        onReorder={onReorderSavedViews}
        onSave={(name) => {
          setViewDraftName(name);
          onSaveCurrentView();
        }}
        viewDraftName={viewDraftName}
        setViewDraftName={setViewDraftName}
      />

      <div className="home-filters-footer">
        <button
          type="button"
          className={`ai-toggle ${aiSearchOpen ? "active" : ""}`}
          onClick={onToggleAiSearch}
          disabled={!aiAvailable}
        >
          🤖 {t('ai.askAI')} {aiAvailable ? "" : `(${t('ai.statusOffline')})`}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onOpenFtsSearch}
        >
          🔍 {t('filters.sourceFts')}
        </button>
      </div>
    </section>
  );
}
