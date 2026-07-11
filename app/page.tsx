"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiSearchBar } from "@/src/components/ai/AiSearchBar";
import { AiStatusIndicator } from "@/src/components/ai/AiStatusIndicator";
import { DashboardWidgets, calculateStats } from "@/src/components/DashboardWidgets";
import { type FilterState } from "@/src/components/AdvancedFilters";
import { ProjectFilter } from "@/src/components/ProjectFilter";
import { ExportButton } from "@/src/components/ExportButton";
import { ShortcutHelp } from "@/src/components/ShortcutHelp";
import { FtsSearch } from "@/src/components/FtsSearch";
import { useToast } from "@/src/components/ToastProvider";
import { IssueCreateModal } from "@/src/components/IssueCreateModal";
import { ColumnPicker, ColumnKey } from "@/src/components/ColumnPicker";
import { KanbanBoard } from "@/src/components/KanbanBoard";
import { GanttChart } from "@/src/components/GanttChart";
import { IssueQuickPeek } from "@/src/components/IssueQuickPeek";
import { SkeletonTable } from "@/src/components/SkeletonTable";
import type {
  Issue,
  SavedView,
} from "@/src/types/dashboard";
import {
  syncTone,
  summarizeSyncError,
  latestSyncTimestamp,
  normalizeIssueRouteId,
  issueNumericId as toIssueNumericId,
  issueRouteId,
  openIssueIdInNewTab,
  openIssueInNewTab,
} from "@/src/lib/issue-utils";
import { useDashboardSavedViews } from "@/src/hooks/useDashboardSavedViews";
import { PAGE_SIZE_OPTIONS, usePageSize } from "@/src/hooks/usePageSize";
import { DashboardHero } from "@/src/components/dashboard/DashboardHero";
import { IssueQueueRow } from "@/src/components/dashboard/IssueQueueRow";
import { DashboardLoginScreen } from "@/src/components/dashboard/DashboardLoginScreen";
import { IssueHoverTooltip } from "@/src/components/dashboard/IssueHoverTooltip";
import { useIssueHoverPreview } from "@/src/hooks/useIssueHoverPreview";
import { useDashboardKeyboardShortcuts } from "@/src/hooks/useDashboardKeyboardShortcuts";
import { useIssueFiltering } from "@/src/hooks/useIssueFiltering";
import { InsightsGrid } from "@/src/components/dashboard/InsightsGrid";
import { OpsAlertsCard } from "@/src/components/dashboard/OpsAlertsCard";
import { ActivityFeedCard } from "@/src/components/dashboard/ActivityFeedCard";
import { useBulkIssueActions } from "@/src/hooks/useBulkIssueActions";
import { DashboardFiltersPanel } from "@/src/components/dashboard/DashboardFiltersPanel";
import { useDashboardData } from "@/src/hooks/useDashboardData";
import { useFilterPresets } from "@/src/hooks/useFilterPresets";

const SHOW_ALL_METRICS_KEY = "nrcc.showAllMetrics.v1";
const DEFAULT_ADVANCED_FILTERS: FilterState = {
  search: "",
  statusIds: [],
  priorityIds: [],
  assignedToMe: false,
  hasGithubLinks: false,
  hasAttachments: false,
};

export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [bulkStatusId, setBulkStatusId] = useState(0);
  const [bulkPriorityId, setBulkPriorityId] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const toast = useToast();
  const [showIssueCreateModal, setShowIssueCreateModal] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set<ColumnKey>(["priority", "due", "progress", "updated"])
  );
  const [manualRefreshBusy, setManualRefreshBusy] = useState(false);
  const [allowedStatusIdsByIssue, setAllowedStatusIdsByIssue] = useState<Record<number, number[]>>({});
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [ftsSearchOpen, setFtsSearchOpen] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<"local" | "hybrid" | "fts">("local");
  const [sort, setSort] = useState("updated_desc");
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>(DEFAULT_ADVANCED_FILTERS);
  const {
    savedViews,
    activeViewId,
    setActiveViewId,
    viewDraftName,
    setViewDraftName,
    saveView,
    deleteView,
    reorderViews,
    clearActiveIfDiverged,
  } = useDashboardSavedViews();
  const {
    filterPresets,
    savingPreset,
    presetNameInput,
    setPresetNameInput,
    startSaving: startSavingPreset,
    cancelSaving: cancelSavingPreset,
    confirmSaving: confirmSavingPreset,
  } = useFilterPresets();
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [opsAlertsOpen, setOpsAlertsOpen] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [issueQueueOpen, setIssueQueueOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "board" | "gantt">("list");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prefetchedIssueIdsRef = useRef<Set<string>>(new Set());
  const heroRef = useRef<HTMLElement>(null);

  const { hoveredIssue, previewPosition, scheduleHoverPreview, cancelHoverPreview } = useIssueHoverPreview();

  const prefetchIssueDetail = useCallback((targetIssueId: number | string | null | undefined) => {
    const routeId = normalizeIssueRouteId(targetIssueId);
    if (!routeId) {
      return;
    }
    if (prefetchedIssueIdsRef.current.has(routeId)) {
      return;
    }
    prefetchedIssueIdsRef.current.add(routeId);
    const encodedRouteId = encodeURIComponent(routeId);
    router.prefetch(`/issues/${encodedRouteId}`);
    void fetch(`/api/issues/${encodedRouteId}`, { cache: "no-store" }).catch(() => {
      prefetchedIssueIdsRef.current.delete(routeId);
    });
  }, [router]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);
    if (advancedFilters.assignedToMe) params.set("assignedToMe", "true");
    params.set("searchMode", searchMode);
    params.set("scope", "issues");
    if (sort) params.set("sort", sort);
    params.set("page", "1");
    return params.toString();
  }, [priorityFilter, search, searchMode, sort, advancedFilters.assignedToMe]);

  const {
    user,
    setUser,
    issues,
    setIssues,
    total,
    statuses,
    priorities,
    syncState,
    setSyncState,
    loading,
    setLoading,
    favoriteIssueIds,
    bootstrapInfo,
    aiStatus,
    aiSummaryCount,
    refreshAll,
    loadActivities,
    loadBootstrapInfo,
  } = useDashboardData({
    queryString,
    onIssuesPageReset: () => setPage(1),
  });

  const {
    computedPriorityOptions,
    visibleIssues,
    allVisibleIssueIds,
    selectedAllVisible,
    summary,
  } = useIssueFiltering({
    issues,
    total,
    priorities,
    selectedProject,
    advancedFilters,
    showFavoritesOnly,
    favoriteIssueIds,
    statusFilter,
    selectedIssueIds,
  });

  const peekNav = useMemo(() => {
    const idx = selectedIssueId == null ? -1 : allVisibleIssueIds.indexOf(selectedIssueId);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < allVisibleIssueIds.length - 1;
    return {
      hasPrev,
      hasNext,
      onPrev: () => { if (hasPrev) setSelectedIssueId(allVisibleIssueIds[idx - 1]); },
      onNext: () => { if (hasNext) setSelectedIssueId(allVisibleIssueIds[idx + 1]); },
    };
  }, [allVisibleIssueIds, selectedIssueId]);

  useEffect(() => {
    if (!heroRef.current) return;
    const el = heroRef.current;
    const update = () => {
      document.documentElement.style.setProperty("--hero-height", `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SHOW_ALL_METRICS_KEY) === "true") {
        setShowAllMetrics(true);
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_ALL_METRICS_KEY, showAllMetrics ? "true" : "false");
    } catch {
      // Ignore storage errors.
    }
  }, [showAllMetrics]);


  useEffect(() => {
    setSelectedIssueIds((current) => current.filter((id) => allVisibleIssueIds.includes(id)));
  }, [allVisibleIssueIds]);

  useEffect(() => {
    clearActiveIfDiverged({ statusFilter, priorityFilter, search, sort });
  }, [clearActiveIfDiverged, priorityFilter, search, sort, statusFilter]);

  function resetPage() {
    setPage(1);
  }

  useDashboardKeyboardShortcuts({
    showShortcutHelp,
    setShowShortcutHelp,
    selectedIssueId,
    setSelectedIssueId,
    searchInputRef,
    resetFilters,
    manualRefreshBusy,
    onManualPull: handleManualPull,
    aiAvailable: Boolean(aiStatus?.available),
    setAiSearchOpen,
  });

  useEffect(() => {
    if (statuses.length === 0) return;
    if (bulkStatusId > 0) return;
    setBulkStatusId(statuses[0].id);
  }, [bulkStatusId, statuses]);

  async function connectRedmine(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/redmine/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Connection failed");
      }

      setUser(data.user);
      await refreshAll();
      await loadActivities();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('login.connectionFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleManualPull() {
    setManualRefreshBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/sync/manual-pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to start manual pull");
      }

      const jobId = data.jobId as string;
      let attempts = 0;
      while (attempts < 30) {
        const statusRes = await fetch("/api/sync/status", { cache: "no-store" });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSyncState(statusData.state ?? null);
          const latest = statusData.latestJob;
          if (latest?.id === jobId && ["success", "failed"].includes(latest.status)) {
            break;
          }
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await refreshAll();
      toast.info(t('toasts.manualPullSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.manualPullFailed'));
    } finally {
      setManualRefreshBusy(false);
    }
  }

  async function bootstrapFromEnv() {
    setBootstrapBusy(true);
    try {
      const res = await fetch("/api/redmine/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to bootstrap from environment");
      }
      setUser(data.user);
      await refreshAll();
      await loadActivities();
      await loadBootstrapInfo();
      toast.info(t('toasts.envSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.envFailed'));
    } finally {
      setBootstrapBusy(false);
    }
  }

  async function updateStatus(issue: Issue, nextStatusId: number) {
    const allowed =
      issue.redmineIssueId !== null ? allowedStatusIdsByIssue[issue.redmineIssueId] : undefined;
    if (allowed && allowed.length > 0 && !allowed.includes(nextStatusId)) {
      toast.error(t('toasts.statusNotAllowed'));
      return;
    }

    const previous = [...issues];
    const nextStatus = statuses.find((s) => s.id === nextStatusId);
    setIssues((current) =>
      current.map((item) =>
        item.redmineIssueId === issue.redmineIssueId
          ? {
              ...item,
              statusId: nextStatusId,
              statusName: nextStatus?.name ?? item.statusName,
            }
          : item,
      ),
    );

    try {
      const res = await fetch(`/api/issues/${issue.redmineIssueId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: nextStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Status update failed");
      }

      await refreshAll();
    } catch (e) {
      setIssues(previous);
      toast.error(e instanceof Error ? e.message : t('toasts.statusFailed'));
    }
  }

  const handleSort = (column: string) => {
    const sortMap: Record<string, [string, string]> = {
      priority: ["priority", "updated_desc"],
      due: ["due_date", "updated_desc"],
      updated: ["updated_desc", "updated_asc"],
    };

    const options = sortMap[column];
    if (!options) return;

    const [defaultSort, alternateSort] = options;
    if (sort === defaultSort) {
      setSort(alternateSort);
    } else if (sort === alternateSort && column === "updated") {
      setSort(defaultSort);
    } else {
      setSort(defaultSort);
    }
  };

  const getSortIndicator = (column: string): string => {
    if (column === "priority" && sort === "priority") return " ▲";
    if (column === "due" && sort === "due_date") return " ▲";
    if (column === "updated" && sort === "updated_desc") return " ▼";
    if (column === "updated" && sort === "updated_asc") return " ▲";
    return "";
  };

  const {
    bulkUpdating,
    updateBulkStatus,
    updateBulkPriority,
    updateBulkMarkDone,
    handleBoardDrop,
  } = useBulkIssueActions({
    selectedIssueIds,
    bulkStatusId,
    bulkPriorityId,
    refreshAll,
    onClearSelection: () => setSelectedIssueIds([]),
    onBulkPriorityApplied: () => setBulkPriorityId(0),
  });

  async function loadAllowedStatuses(issueId: number) {
    if (allowedStatusIdsByIssue[issueId]) {
      return;
    }

    const localIssue = issues.find((item) => item.redmineIssueId === issueId);
    const fromIssue = localIssue?.allowedStatuses?.map((s) => s.id) ?? [];
    if (fromIssue.length > 0) {
      setAllowedStatusIdsByIssue((current) => ({
        ...current,
        [issueId]: fromIssue,
      }));
      return;
    }

    const res = await fetch(`/api/issues/${issueId}/status`, { cache: "no-store" });
    if (!res.ok) {
      return;
    }

    const data = await res.json();
    const ids = Array.isArray(data.allowedStatusIds) ? data.allowedStatusIds : [];
    setAllowedStatusIdsByIssue((current) => ({
      ...current,
      [issueId]: ids,
    }));
  }

  function applySavedView(view: SavedView) {
    setStatusFilter(view.statusFilter);
    setPriorityFilter(view.priorityFilter);
    setSearch(view.search);
    setSort(view.sort);
    setAdvancedFilters((current) => ({ ...current, assignedToMe: view.assignedToMe ?? false }));
    setActiveViewId(view.id);
  }

  function saveCurrentView() {
    const fallbackName = t('views.defaultName', { count: savedViews.length + 1 });
    const { view, replaced } = saveView(
      {
        statusFilter,
        priorityFilter,
        search,
        sort,
        assignedToMe: advancedFilters.assignedToMe,
      },
      fallbackName,
    );
    toast.info(
      replaced
        ? t('toasts.viewSavedChanges', { name: view.name })
        : t('toasts.viewSaved', { name: view.name }),
    );
  }

  function deleteSavedView(viewId: string) {
    const target = deleteView(viewId);
    if (target) {
      toast.info(t('toasts.viewRemoved', { name: target.name }));
    }
  }

  function toggleIssueSelection(issueId: number) {
    setSelectedIssueIds((current) =>
      current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedIssueIds((current) => {
      if (allVisibleIssueIds.length === 0) {
        return [];
      }
      if (selectedAllVisible) {
        return current.filter((id) => !allVisibleIssueIds.includes(id));
      }
      const combined = new Set([...current, ...allVisibleIssueIds]);
      return Array.from(combined);
    });
  }

  function resetFilters() {
    setStatusFilter("");
    setPriorityFilter("");
    setSearch("");
    setSearchMode("local");
    setSort("updated_desc");
    setSelectedProject(null);
    setShowFavoritesOnly(false);
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
    setActiveViewId(null);
  }

  if (!user) {
    return (
      <DashboardLoginScreen
        baseUrl={baseUrl}
        apiKey={apiKey}
        onBaseUrlChange={setBaseUrl}
        onApiKeyChange={setApiKey}
        onSubmit={connectRedmine}
        loading={loading}
        bootstrapInfo={bootstrapInfo}
        bootstrapBusy={bootstrapBusy}
        onBootstrapFromEnv={bootstrapFromEnv}
        error={error}
      />
    );
  }

  const syncStateTone = syncTone(syncState?.lastSyncStatus);
  const lastSyncAt = latestSyncTimestamp(syncState);

  return (
    <main className="dashboard">
      <header className="card hero" ref={heroRef}>
        <div className="hero-top">
          <div className="hero-heading">
            <p className="kicker">{t('hero.kicker')}</p>
            <h1 className="hero-title">{t('hero.title')}</h1>
            <p className="muted">
              {t('hero.signedInAs', { displayName: user.displayName, username: user.username })}
            </p>
          </div>
          <div className="hero-status-rail">
            <div className={`sync-pill sync-${syncStateTone}`}>
              {t('hero.syncStatus', { status: t(`hero.syncStatus${(syncState?.lastSyncStatus ?? 'idle').charAt(0).toUpperCase() + (syncState?.lastSyncStatus ?? 'idle').slice(1)}`) })}
              {lastSyncAt
                ? ` • ${new Date(lastSyncAt).toLocaleString()}`
                : ` • ${t('hero.syncWaiting')}`}
            </div>
            {aiStatus?.available && (
              <div className="ai-status-pill">
                {t(aiStatus.usingFallback ? 'hero.aiFallback' : 'hero.aiCloud')}
              </div>
            )}
          </div>
        </div>
        {syncState?.lastSyncStatus === "failed" && (
          <p className="sync-error-inline">
            Last sync error: {summarizeSyncError(syncState.lastError, t)}
          </p>
        )}
      </header>

      <DashboardHero
        stats={summary}
        aiSummaryCount={aiSummaryCount}
        loading={loading}
        manualRefreshBusy={manualRefreshBusy}
        showAllMetrics={showAllMetrics}
        onManualPull={handleManualPull}
        onResetFilters={resetFilters}
        onOpenShortcuts={() => setShowShortcutHelp(true)}
        onToggleAllMetrics={() => setShowAllMetrics((v) => !v)}
        aiStatusIndicator={<AiStatusIndicator />}
      />

      <DashboardFiltersPanel
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statuses={statuses}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        priorities={priorities}
        sort={sort}
        onSortChange={setSort}
        search={search}
        onSearchChange={setSearch}
        searchInputRef={searchInputRef}
        searchMode={searchMode}
        onSearchModeChange={setSearchMode}
        onResetPage={resetPage}
        savedViews={savedViews}
        activeViewId={activeViewId}
        onApplySavedView={applySavedView}
        onDeleteSavedView={deleteSavedView}
        onReorderSavedViews={reorderViews}
        onSaveCurrentView={saveCurrentView}
        viewDraftName={viewDraftName}
        setViewDraftName={setViewDraftName}
        aiSearchOpen={aiSearchOpen}
        aiAvailable={Boolean(aiStatus?.available)}
        onToggleAiSearch={() => setAiSearchOpen(!aiSearchOpen)}
        onOpenFtsSearch={() => setFtsSearchOpen(true)}
      />

      <InsightsGrid
        topStatuses={summary.topStatuses}
        priorityMix={summary.priorityMix}
        totalVisible={summary.totalVisible}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />



      {aiSearchOpen && aiStatus?.available && (
        <section className="card filters-panel">
          <h3>🔍 AI-Powered Search</h3>
          <AiSearchBar />
        </section>
      )}

      {ftsSearchOpen && (
        <section className="card filters-panel">
          <div className="collapsible-head">
            <h3>🔍 Full-text Database Search</h3>
            <button type="button" className="secondary-button" onClick={() => setFtsSearchOpen(false)}>
              Close
            </button>
          </div>
          <FtsSearch onSelect={() => setFtsSearchOpen(false)} />
        </section>
      )}

      <section className="collapsible-stack">
        <OpsAlertsCard
          atRisk={summary.atRisk}
          open={opsAlertsOpen}
          onToggleOpen={() => setOpsAlertsOpen((current) => !current)}
          onPrefetchIssue={(issue) => prefetchIssueDetail(issueRouteId(issue))}
          onOpenIssue={openIssueInNewTab}
          manualRefreshBusy={manualRefreshBusy}
          onManualPull={handleManualPull}
        />

        <ActivityFeedCard
          recentActivity={summary.recentActivity}
          open={activityFeedOpen}
          onToggleOpen={() => setActivityFeedOpen((current) => !current)}
          onPrefetchIssue={prefetchIssueDetail}
          onOpenIssue={openIssueIdInNewTab}
        />

        {/* Analytics Dashboard */}
        <article className="card charts-card">
          <div className="collapsible-head">
            <div>
              <h2>{t('analytics.title')}</h2>
              <p className="muted">{t('analytics.desc')}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setShowCharts((c) => !c)}>
              {showCharts ? "Collapse" : "Expand"}
            </button>
          </div>
          {showCharts && visibleIssues.length > 0 && (
            <DashboardWidgets stats={calculateStats(visibleIssues)} />
          )}
        </article>

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
                onClick={() => setIssueQueueOpen((current) => !current)}
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
                      <select value={bulkStatusId} onChange={(e) => setBulkStatusId(Number(e.target.value))}>
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
                      onClick={updateBulkStatus}
                      disabled={bulkUpdating || bulkStatusId <= 0}
                    >
                      {bulkUpdating ? "Applying..." : "Apply status"}
                    </button>
                    <label className="inline-field">
                      Bulk Priority
                      <select value={bulkPriorityId} onChange={(e) => setBulkPriorityId(Number(e.target.value))}>
                        <option value={0}>—</option>
                        {computedPriorityOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={updateBulkPriority}
                      disabled={bulkUpdating || bulkPriorityId <= 0}
                    >
                      {bulkUpdating ? "Applying..." : "Apply priority"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={updateBulkMarkDone}
                      disabled={bulkUpdating}
                      title="Set progress to 100% on all selected"
                    >
                      Mark 100%
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setSelectedIssueIds([])}>
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
                    onClick={() => { setStatusFilter(""); resetPage(); }}
                  >
                    All ({summary.totalVisible})
                  </button>
                  <button
                    type="button"
                    className={`quick-filter-btn quick-open ${statusFilter === "Open" ? "active" : ""}`}
                    onClick={() => { setStatusFilter("Open"); resetPage(); }}
                  >
                    <span aria-hidden="true">🟢</span> Open ({summary.open})
                  </button>
                  <button
                    type="button"
                    className={`quick-filter-btn quick-progress ${statusFilter.includes("progress") || statusFilter.includes("dev") ? "active" : ""}`}
                    onClick={() => { setStatusFilter("In Progress"); resetPage(); }}
                  >
                    <span aria-hidden="true">🔵</span> In Progress ({summary.inProgress})
                  </button>
                  <button
                    type="button"
                    className={`quick-filter-btn quick-blocked ${statusFilter.toLowerCase().includes("blocked") ? "active" : ""}`}
                    onClick={() => { setStatusFilter("Blocked"); resetPage(); }}
                  >
                    <span aria-hidden="true">🛑</span> Blocked ({summary.blocked})
                  </button>
                  {summary.overdue > 0 && (
                    <button
                      type="button"
                      className={`quick-filter-btn quick-overdue`}
                      onClick={() => { setStatusFilter("Overdue"); resetPage(); }}
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
                          setStatusFilter(preset.statusFilter);
                          setPriorityFilter(preset.priorityFilter);
                          setSearch(preset.search);
                          setShowFavoritesOnly(preset.showFavoritesOnly);
                          resetPage();
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
                      onClick={() => setShowIssueCreateModal(true)}
                    >
                      + New Issue
                    </button>
                    <ColumnPicker visibleColumns={visibleColumns} onChange={setVisibleColumns} />
                    {savingPreset ? (
                      <div className="preset-name-input-group">
                        <input
                          autoFocus
                          type="text"
                          className="preset-name-input"
                          placeholder="Preset name…"
                          value={presetNameInput}
                          onChange={(e) => setPresetNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && presetNameInput.trim()) {
                              confirmSavingPreset({
                                statusFilter, priorityFilter, search, showFavoritesOnly,
                                assignedToMe: advancedFilters.assignedToMe,
                              });
                            } else if (e.key === "Escape") {
                              cancelSavingPreset();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="preset-confirm-btn"
                          disabled={!presetNameInput.trim()}
                          onClick={() => {
                            confirmSavingPreset({ statusFilter, priorityFilter, search, showFavoritesOnly });
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="preset-cancel-btn"
                          onClick={cancelSavingPreset}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="preset-save-btn"
                        onClick={startSavingPreset}
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
                      setSelectedProject(project);
                      resetPage();
                    }}
                  />
                  <button
                    type="button"
                    className={`favorite-filter ${advancedFilters.assignedToMe ? "active" : ""}`}
                    onClick={() => {
                      setAdvancedFilters((current) => ({ ...current, assignedToMe: !current.assignedToMe }));
                      resetPage();
                    }}
                  >
                    {advancedFilters.assignedToMe ? t('queue.assignedToMeOn') : t('queue.assignedToMeOff')}
                  </button>
                  <button
                    type="button"
                    className={`favorite-filter ${showFavoritesOnly ? "active" : ""}`}
                    onClick={() => {
                      setShowFavoritesOnly(!showFavoritesOnly);
                      resetPage();
                    }}
                  >
                    {showFavoritesOnly ? t('queue.favoritesOn') : t('queue.favoritesOff')}
                  </button>
                  <ExportButton issues={visibleIssues} format="csv" />
                  <ExportButton issues={visibleIssues} format="print" />
                </div>
              </div>

              <div className="view-mode-tabs" role="tablist" aria-label="Issue view mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "list"}
                  className={`secondary-button ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                >
                  {t('queue.viewList')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "board"}
                  className={`secondary-button ${viewMode === "board" ? "active" : ""}`}
                  onClick={() => setViewMode("board")}
                >
                  {t('queue.viewBoard')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "gantt"}
                  className={`secondary-button ${viewMode === "gantt" ? "active" : ""}`}
                  onClick={() => setViewMode("gantt")}
                >
                  {t('queue.viewGantt')}
                </button>
              </div>

              {viewMode === "board" ? (
                <KanbanBoard
                  issues={visibleIssues
                    .filter((i): i is typeof i & { redmineIssueId: number } =>
                      Number.isInteger(i.redmineIssueId) && (i.redmineIssueId ?? 0) > 0,
                    )
                    .map((i) => ({
                      id: i.id,
                      redmineIssueId: i.redmineIssueId as number,
                      subject: i.subject,
                      projectName: i.projectName,
                      priority: i.priority,
                      statusId: i.statusId,
                      statusName: i.statusName,
                      doneRatio: i.doneRatio ?? null,
                    }))}
                  statuses={statuses}
                  onDrop={handleBoardDrop}
                  onClick={(boardIssue) => setSelectedIssueId(boardIssue.redmineIssueId)}
                />
              ) : viewMode === "gantt" ? (
                <GanttChart
                  issues={visibleIssues
                    .filter((i): i is typeof i & { redmineIssueId: number } =>
                      Number.isInteger(i.redmineIssueId) && (i.redmineIssueId ?? 0) > 0,
                    )
                    .map((i) => ({
                      id: i.id,
                      redmineIssueId: i.redmineIssueId as number,
                      subject: i.subject,
                      projectName: i.projectName,
                      priority: i.priority,
                      statusName: i.statusName,
                      startDate: i.startDate ?? null,
                      dueDate: i.dueDate ?? null,
                      createdAt: i.createdAt,
                      updatedAt: i.updatedAt,
                      doneRatio: i.doneRatio ?? null,
                    }))}
                  onClick={(g) => setSelectedIssueId(g.redmineIssueId)}
                />
              ) : (
                <>
                <table className="issues-table">
                  <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedAllVisible}
                        onChange={toggleSelectAllVisible}
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
                        onClick={() => handleSort("priority")}
                        style={{ cursor: "pointer" }}
                        title="Sort by priority"
                      >
                        Priority{getSortIndicator("priority")}
                      </th>
                    )}
                    {visibleColumns.has("due") && (
                      <th
                        className="sortable-header"
                        onClick={() => handleSort("due")}
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
                        onClick={() => handleSort("updated")}
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
                          onSelect={(id) => setSelectedIssueId(id)}
                          onOpenInNewTab={(it) => openIssueInNewTab(it)}
                          onPrefetch={(routeId) => prefetchIssueDetail(routeId)}
                          onToggleSelection={(id) => toggleIssueSelection(id)}
                          onStatusChange={(it, statusId) => updateStatus(it, statusId)}
                          onLoadAllowedStatuses={(id) => void loadAllowedStatuses(id)}
                          onHoverEnter={(it, anchor) => scheduleHoverPreview(it, anchor)}
                          onHoverLeave={cancelHoverPreview}
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
                        onClick={() => { setPage(1); }}
                        disabled={safePage === 1}
                        aria-label="First page"
                      >
                        ««
                      </button>
                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => { setPage(p => Math.max(1, p - 1)); }}
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
                        onClick={() => { setPage(p => p + 1); }}
                        disabled={safePage >= maxPage}
                        aria-label="Next page"
                      >
                        »
                      </button>
                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => { setPage(maxPage); }}
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
                          setPageSize(n);
                          setPage(1);
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

        {/* Issue Preview Tooltip — anchored to row right edge with 300ms delay */}
        <IssueHoverTooltip issue={hoveredIssue} position={previewPosition} />
      </section>



      {showShortcutHelp && (
        <ShortcutHelp isOpen={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} />
      )}
      
      <IssueCreateModal
        isOpen={showIssueCreateModal}
        onClose={() => setShowIssueCreateModal(false)}
        onCreated={(newIssue) => {
          setIssues((prev) => [newIssue, ...prev]);
          setSelectedIssueId(newIssue.redmineIssueId);
        }}
        statuses={statuses}
        priorities={computedPriorityOptions}
      />

      <IssueQuickPeek
        issueId={selectedIssueId}
        onClose={() => setSelectedIssueId(null)}
        onOpenFullPage={(issue) => openIssueInNewTab(issue)}
        hasPrev={peekNav.hasPrev}
        hasNext={peekNav.hasNext}
        onPrev={peekNav.onPrev}
        onNext={peekNav.onNext}
      />
    </main>
  );
}
