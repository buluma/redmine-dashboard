"use client";

import { useI18n } from "@/src/components/I18nProvider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiSearchBar } from "@/src/components/ai/AiSearchBar";
import { AiStatusIndicator } from "@/src/components/ai/AiStatusIndicator";
import { DashboardWidgets, calculateStats } from "@/src/components/DashboardWidgets";
import { type FilterState } from "@/src/components/AdvancedFilters";
import { ShortcutHelp } from "@/src/components/ShortcutHelp";
import { FtsSearch } from "@/src/components/FtsSearch";
import { useToast } from "@/src/components/ToastProvider";
import { IssueCreateModal } from "@/src/components/IssueCreateModal";
import { type ColumnKey } from "@/src/components/ColumnPicker";
import { IssueQuickPeek } from "@/src/components/IssueQuickPeek";
import type {
  Issue,
  SavedView,
} from "@/src/types/dashboard";
import {
  syncTone,
  summarizeSyncError,
  latestSyncTimestamp,
  normalizeIssueRouteId,
  issueRouteId,
  openIssueIdInNewTab,
  openIssueInNewTab,
} from "@/src/lib/issue-utils";
import { useDashboardSavedViews } from "@/src/hooks/useDashboardSavedViews";
import { usePageSize } from "@/src/hooks/usePageSize";
import { DashboardHero } from "@/src/components/dashboard/DashboardHero";
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
import { IssueQueueCard } from "@/src/components/dashboard/IssueQueueCard";

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

        <IssueQueueCard
          loading={loading}
          visibleIssues={visibleIssues}
          issues={issues}
          summary={summary}
          issueQueueOpen={issueQueueOpen}
          onToggleIssueQueueOpen={() => setIssueQueueOpen((current) => !current)}
          selectedIssueIds={selectedIssueIds}
          onClearBulkSelection={() => setSelectedIssueIds([])}
          statuses={statuses}
          bulkStatusId={bulkStatusId}
          onBulkStatusIdChange={setBulkStatusId}
          bulkPriorityId={bulkPriorityId}
          onBulkPriorityIdChange={setBulkPriorityId}
          computedPriorityOptions={computedPriorityOptions}
          bulkUpdating={bulkUpdating}
          onUpdateBulkStatus={updateBulkStatus}
          onUpdateBulkPriority={updateBulkPriority}
          onUpdateBulkMarkDone={updateBulkMarkDone}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onResetPage={resetPage}
          filterPresets={filterPresets}
          savingPreset={savingPreset}
          presetNameInput={presetNameInput}
          onPresetNameInputChange={setPresetNameInput}
          onStartSavingPreset={startSavingPreset}
          onCancelSavingPreset={cancelSavingPreset}
          onConfirmSavingPreset={confirmSavingPreset}
          onApplyPreset={(preset) => {
            setStatusFilter(preset.statusFilter);
            setPriorityFilter(preset.priorityFilter);
            setSearch(preset.search);
            setShowFavoritesOnly(preset.showFavoritesOnly);
            resetPage();
          }}
          priorityFilter={priorityFilter}
          search={search}
          showFavoritesOnly={showFavoritesOnly}
          onShowFavoritesOnlyChange={setShowFavoritesOnly}
          assignedToMe={advancedFilters.assignedToMe}
          onAssignedToMeChange={(value) => setAdvancedFilters((current) => ({ ...current, assignedToMe: value }))}
          onOpenIssueCreateModal={() => setShowIssueCreateModal(true)}
          visibleColumns={visibleColumns}
          onVisibleColumnsChange={setVisibleColumns}
          selectedProject={selectedProject}
          onSelectedProjectChange={setSelectedProject}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onBoardDrop={handleBoardDrop}
          onSelectIssueId={setSelectedIssueId}
          selectedAllVisible={selectedAllVisible}
          onToggleSelectAllVisible={toggleSelectAllVisible}
          onSort={handleSort}
          getSortIndicator={getSortIndicator}
          allowedStatusIdsByIssue={allowedStatusIdsByIssue}
          selectedIssueId={selectedIssueId}
          page={page}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          total={total}
          onOpenInNewTab={openIssueInNewTab}
          onPrefetchIssue={prefetchIssueDetail}
          onToggleIssueSelection={toggleIssueSelection}
          onUpdateStatus={updateStatus}
          onLoadAllowedStatuses={(id) => void loadAllowedStatuses(id)}
          onHoverEnter={scheduleHoverPreview}
          onHoverLeave={cancelHoverPreview}
        />

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
