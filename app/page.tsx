"use client";

import { useI18n } from "@/src/components/I18nProvider";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { AiSearchBar } from "@/src/components/ai/AiSearchBar";
import { AiStatusIndicator } from "@/src/components/ai/AiStatusIndicator";
import { DashboardWidgets, calculateStats } from "@/src/components/DashboardWidgets";
import { AdvancedFilters, applyFilters, type FilterState } from "@/src/components/AdvancedFilters";
import { ProjectFilter } from "@/src/components/ProjectFilter";
import { ExportButton } from "@/src/components/ExportButton";
import { ShortcutHelp } from "@/src/components/ShortcutHelp";
import { FtsSearch } from "@/src/components/FtsSearch";
import { SavedViewsPanel } from "@/src/components/SavedViewsPanel";
import { useToast } from "@/src/components/ToastProvider";
import { IssueCreateModal } from "@/src/components/IssueCreateModal";
import { ColumnPicker, ColumnKey } from "@/src/components/ColumnPicker";
import { KanbanBoard } from "@/src/components/KanbanBoard";
import { GanttChart } from "@/src/components/GanttChart";
import { IssueQuickPeek } from "@/src/components/IssueQuickPeek";
import { SkeletonTable } from "@/src/components/SkeletonTable";
import type {
  User,
  Journal,
  TimeEntry,
  GithubLink,
  Attachment,
  Relation,
  IssueChild,
  Issue,
  StatusCatalog,
  SyncState,
  BootstrapInfo,
  FilterPreset,
  SavedView,
  ActivityEvent,
} from "@/src/types/dashboard";
import {
  attachmentUrl,
  redmineIssueUrl,
  isImageAttachment,
  isPdfAttachment,
  normalizeStatus,
  uniqueStrings,
  isOpenStatus,
  isInProgressStatus,
  isDoneStatus,
  isBlockedStatus,
  dueInDays,
  issueUrgency,
  syncTone,
  summarizeSyncError,
  latestSyncTimestamp,
  dayDiffFromNow,
  latestIssueActivityTimestamp,
  activityTypeLabel,
  matchesView,
  formatDurationFromMs,
  normalizeIssueRouteId,
  issueRouteId,
  issueDisplayId,
  openIssueIdInNewTab,
  openIssueInNewTab,
} from "@/src/lib/issue-utils";
import { MarkdownBlock } from "@/src/components/MarkdownBlock";
import { useDashboardSavedViews } from "@/src/hooks/useDashboardSavedViews";
import { useEventStream } from "@/src/hooks/useEventStream";
import { PAGE_SIZE_OPTIONS, usePageSize } from "@/src/hooks/usePageSize";
import { DashboardHero } from "@/src/components/dashboard/DashboardHero";
import { IssueQueueRow } from "@/src/components/dashboard/IssueQueueRow";

const POLL_INTERVAL_MS = 90_000;
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
  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const fetchPageSize = 200;
  const [statuses, setStatuses] = useState<StatusCatalog[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [searchSource, setSearchSource] = useState("local_cache");
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [bulkStatusId, setBulkStatusId] = useState(0);
  const [bulkPriorityId, setBulkPriorityId] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [loading, setLoading] = useState(true);
  const [priorityOptions, setPriorityOptions] = useState<Array<{ id: number; name: string }>>([]);
  const toast = useToast();
  const [showIssueCreateModal, setShowIssueCreateModal] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    new Set<ColumnKey>(["priority", "due", "progress", "updated"])
  );
  const [manualRefreshBusy, setManualRefreshBusy] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [allowedStatusIdsByIssue, setAllowedStatusIdsByIssue] = useState<Record<number, number[]>>({});
  const [bootstrapInfo, setBootstrapInfo] = useState<BootstrapInfo>(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ available: boolean; primaryModel: string; usingFallback: boolean } | null>(null);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [ftsSearchOpen, setFtsSearchOpen] = useState(false);
  const [aiSummaryCount, setAiSummaryCount] = useState(0);

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
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [hoveredIssue, setHoveredIssue] = useState<Issue | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [draggedIssueId, setDraggedIssueId] = useState<number | null>(null);
  const [opsAlertsOpen, setOpsAlertsOpen] = useState(false);
  const [activityFeedOpen, setActivityFeedOpen] = useState(false);
  const [issueQueueOpen, setIssueQueueOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "board" | "gantt">("list");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIssueIds, setFavoriteIssueIds] = useState<number[]>([]);
  const [showCharts, setShowCharts] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const [activityId, setActivityId] = useState(0);


  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prefetchedIssueIdsRef = useRef<Set<string>>(new Set());
  const heroRef = useRef<HTMLElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHoverPreview = useCallback((issue: Issue, anchor: HTMLElement) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      const rect = anchor.getBoundingClientRect();
      const TOOLTIP_WIDTH = 360;
      const margin = 12;
      let left = rect.right + 8;
      if (left + TOOLTIP_WIDTH + margin > window.innerWidth) {
        left = Math.max(margin, rect.left - TOOLTIP_WIDTH - 8);
      }
      const top = Math.min(
        Math.max(margin, rect.top),
        window.innerHeight - 200,
      );
      setPreviewPosition({ x: left, y: top });
      setHoveredIssue(issue);
    }, 300);
  }, []);

  const cancelHoverPreview = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredIssue(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

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

  const selectedIssue = useMemo(
    () => issues.find((i) => i.redmineIssueId === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const computedPriorityOptions = useMemo(() => {
    const discovered = new Map<number, string>();
    for (const issue of issues) {
      if (typeof issue.priorityId === "number" && issue.priorityId > 0) {
        discovered.set(issue.priorityId, issue.priorityName ?? issue.priority ?? `Priority ${issue.priorityId}`);
      }
    }

    if (discovered.size > 0) {
      return Array.from(discovered.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }

    return priorities.map((name, index) => ({ id: index + 1, name }));
  }, [issues, priorities]);

  const baseFilteredIssues = useMemo(() => {
    let filtered = issues;

    if (selectedProject) {
      filtered = filtered.filter((issue) => issue.projectName === selectedProject);
    }

    filtered = applyFilters(filtered, advancedFilters);

    if (showFavoritesOnly) {
      filtered = filtered.filter((issue) => favoriteIssueIds.includes(issue.redmineIssueId));
    }

    return filtered;
  }, [advancedFilters, favoriteIssueIds, issues, selectedProject, showFavoritesOnly]);

  const visibleIssues = useMemo(() => {
    if (statusFilter === "Open") {
      return baseFilteredIssues.filter((issue) => isOpenStatus(issue.statusName));
    }
    if (statusFilter === "Blocked") {
      return baseFilteredIssues.filter((issue) => isBlockedStatus(issue.statusName));
    }
    if (statusFilter === "Overdue") {
      return baseFilteredIssues.filter((issue) => issueUrgency(issue) === "overdue");
    }
    if (statusFilter) {
      return baseFilteredIssues.filter((issue) => issue.statusName === statusFilter);
    }
    return baseFilteredIssues;
  }, [baseFilteredIssues, statusFilter]);


  const allVisibleIssueIds = useMemo(
    () => visibleIssues
      .map((i) => i.redmineIssueId)
      .filter((id): id is number => Number.isInteger(id) && id > 0),
    [visibleIssues],
  );

  const selectedAllVisible = useMemo(
    () => allVisibleIssueIds.length > 0 && allVisibleIssueIds.every((id) => selectedIssueIds.includes(id)),
    [allVisibleIssueIds, selectedIssueIds],
  );

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

  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byPriority = new Map<string, number>();
    const atRiskCandidates: Array<{ issue: Issue; severity: number; reason: string }> = [];
    const activityFeed: ActivityEvent[] = [];

    let open = 0;
    let inProgress = 0;
    let done = 0;
    let blocked = 0;
    let overdue = 0;
    let dueSoon = 0;
    let stale = 0;
    let dueToday = 0;
    let totalProgress = 0;
    let openUpdateAgeDays = 0;

    for (const issue of baseFilteredIssues) {
      byStatus.set(issue.statusName, (byStatus.get(issue.statusName) ?? 0) + 1);
      byPriority.set(issue.priority ?? "Unspecified", (byPriority.get(issue.priority ?? "Unspecified") ?? 0) + 1);

      const openState = isOpenStatus(issue.statusName);
      const blockedState = isBlockedStatus(issue.statusName);
      const urgency = issueUrgency(issue);
      const ageDays = dayDiffFromNow(latestIssueActivityTimestamp(issue));
      const daysToDue = dueInDays(issue.dueDate);

      if (openState) {
        open += 1;
        if (!blockedState) openUpdateAgeDays += ageDays;
      }
      if (isInProgressStatus(issue.statusName)) inProgress += 1;
      if (isDoneStatus(issue.statusName)) done += 1;
      if (blockedState) blocked += 1;
      if (urgency === "overdue") overdue += 1;
      if (urgency === "soon") dueSoon += 1;
      if (openState && ageDays >= 3) stale += 1;
      if (openState && daysToDue === 0) dueToday += 1;

      totalProgress += issue.doneRatio ?? 0;

      let severity = 0;
      const reasons: string[] = [];
      if (urgency === "overdue") {
        severity += 3;
        reasons.push("overdue");
      }
      if (blockedState) {
        severity += 2;
        reasons.push("blocked");
      }
      if (openState && ageDays >= 3) {
        severity += 1;
        reasons.push(`stale ${ageDays}d`);
      }
      if (severity > 0) {
        atRiskCandidates.push({ issue, severity, reason: reasons.join(" + ") });
      }

      activityFeed.push({
        issueId: issueRouteId(issue),
        issueLabel: issueDisplayId(issue),
        issueSubject: issue.subject,
        timestamp: latestIssueActivityTimestamp(issue),
        detail: `Latest activity: ${activityTypeLabel(issue.lastActivityType)}`,
      });

      for (const journal of issue.journals.slice(0, 3)) {
        activityFeed.push({
          issueId: issueRouteId(issue),
          issueLabel: issueDisplayId(issue),
          issueSubject: issue.subject,
          timestamp: journal.createdOnRemote,
          detail: `${journal.author ?? "Unknown"} commented`,
        });
      }

      for (const entry of issue.timeEntries.slice(0, 2)) {
        activityFeed.push({
          issueId: issueRouteId(issue),
          issueLabel: issueDisplayId(issue),
          issueSubject: issue.subject,
          timestamp: entry.spentOn,
          detail: `${entry.hours.toFixed(1)}h logged${entry.activityName ? ` (${entry.activityName})` : ""}`,
        });
      }
    }

    const topStatuses = Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const priorityMix = Array.from(byPriority.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const count = baseFilteredIssues.length || 1;
    const completion = Math.round((done / count) * 100);
    const avgDoneRatio = Math.round(totalProgress / count);

    const atRisk = atRiskCandidates
      .sort((a, b) => {
        if (b.severity !== a.severity) return b.severity - a.severity;
        return new Date(latestIssueActivityTimestamp(a.issue)).getTime() - new Date(latestIssueActivityTimestamp(b.issue)).getTime();
      })
      .slice(0, 7);

    const recentActivity = activityFeed
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);

    return {
      totalVisible: baseFilteredIssues.length,
      total,
      open,
      inProgress,
      done,
      blocked,
      overdue,
      dueSoon,
      stale,
      dueToday,
      completion,
      avgDoneRatio,
      avgOpenAgeDays: (open - blocked) > 0 ? Math.round(openUpdateAgeDays / (open - blocked)) : 0,
      topStatuses,
      priorityMix,
      atRisk,
      recentActivity,
    };
  }, [total, baseFilteredIssues]);

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

  async function loadSession() {
    try {
      const res = await fetch("/api/session/me", { cache: "no-store" });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    }
  }

  async function loadBootstrapInfo() {
    const res = await fetch("/api/redmine/bootstrap", { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setBootstrapInfo(data);
  }

  async function loadAiStatus() {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch {
      // AI not available
      setAiStatus(null);
    }
  }

  async function loadAiSummaryCount() {
    try {
      const res = await fetch("/api/ai/summary-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAiSummaryCount(data.count ?? 0);
      }
    } catch {
      setAiSummaryCount(0);
    }
  }

  async function loadSyncStatus() {
    if (!user) return;
    const res = await fetch("/api/sync/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const state = (data.state ?? null) as SyncState;
      if (state && !state.lastError && data.latestJob?.error) {
        state.lastError = String(data.latestJob.error);
      }
      setSyncState(state);
    }
  }

  async function loadIssues() {
    if (!user) return;
    const res = await fetch(`/api/issues?${queryString}&pageSize=${fetchPageSize}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to load issues");
    }

    const data = await res.json();
    setIssues(data.items ?? []);
    setTotal(data.total ?? 0);
    setStatuses(data.filters?.statuses ?? []);
    setPriorities(uniqueStrings(data.filters?.priorities ?? []));
    setSearchSource(data.source ?? "local_cache");
    setPage(1); // Reset to page 1 on fresh data
  }

  async function loadActivities() {
    if (!user) return;
    const res = await fetch("/api/internal/activities", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const fetched = data.activities ?? [];
      setActivities(fetched);
      if (fetched.length > 0 && activityId === 0) {
        setActivityId(fetched[0].id);
      }
    }
  }

  function resetPage() {
    setPage(1);
  }

  async function loadFavorites() {
    try {
      const res = await fetch("/api/issues/favorites", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setFavoriteIssueIds(data.favorites ?? []);
      }
    } catch {
      // Ignore errors
    }
  }

  async function refreshAll() {
    setLoading(true);
    try {
      await loadIssues();
      await loadSyncStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadPriorities() {
    try {
      const res = await fetch("/api/internal/enumerations?kind=issue_priority");
      if (res.ok) {
        const data = await res.json();
        setPriorityOptions(data.items.map((i: any) => ({ id: i.remoteId, name: i.name })));
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSession(), loadBootstrapInfo(), loadAiStatus(), loadAiSummaryCount(), loadPriorities()]);
      } finally {
        setLoading(false);
      }
    })();


  }, []);

  useEffect(() => {
    if (!user) return;

    void refreshAll();
    void loadActivities();
    void loadFavorites();

    const id = setInterval(() => {
      void refreshAll();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
    // refreshAll/loadActivities intentionally depend on current query + user snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, user]);

  // Live updates via Server-Sent Events. The polling loop above stays
  // as a backstop in case the stream is dropped by an intermediate proxy.
  useEventStream({
    enabled: Boolean(user),
    handlers: {
      "issue.created": () => { void refreshAll(); },
      "issue.updated": () => { void refreshAll(); },
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inTypingField = Boolean(
        target
        && (target.tagName === "INPUT"
          || target.tagName === "TEXTAREA"
          || target.tagName === "SELECT"
          || target.isContentEditable),
      );

      if (event.key === "Escape") {
        if (showShortcutHelp) {
          setShowShortcutHelp(false);
          return;
        }
        if (selectedIssueId) {
          setSelectedIssueId(null);
        }
        return;
      }

      if (inTypingField) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        resetFilters();
        return;
      }

      if (event.key.toLowerCase() === "r" && !manualRefreshBusy) {
        event.preventDefault();
        void handleManualPull();
        return;
      }

      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        window.location.assign("/reports");
        return;
      }

      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        window.location.assign("/ops");
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShowShortcutHelp((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "a" && aiStatus?.available) {
        event.preventDefault();
        setAiSearchOpen((current) => !current);
        return;
      }

      const navigateTo = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
          event.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };

      if (event.altKey) {
        if (event.key === "1") navigateTo("summary-insights");
        if (event.key === "2") navigateTo("ops-alerts");
        if (event.key === "3") navigateTo("activity-feed");
        if (event.key === "4") navigateTo("issue-queue");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // keyboard handlers intentionally bind to latest reactive state snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualRefreshBusy, selectedIssueId, showShortcutHelp]);

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
    setInfoMessage(null);

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
    const allowed = allowedStatusIdsByIssue[issue.redmineIssueId];
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

  async function updateBulkStatus() {
    if (selectedIssueIds.length === 0 || bulkStatusId <= 0) {
      return;
    }

    setBulkUpdating(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch("/api/issues/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: selectedIssueIds, statusId: bulkStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk status update failed");
      }

      const failedCount = Number(data.failedCount ?? 0);
      const updatedCount = Number(data.updatedCount ?? 0);
      if (failedCount > 0) {
        toast.error(t('toasts.bulkFailedLog', { updated: updatedCount, failed: failedCount }));
        // keep a compact breadcrumb for deeper troubleshooting.
        console.error("Bulk update failures", data.failures ?? []);
      } else {
        toast.info(t('toasts.bulkSuccess', { updated: updatedCount }));
      }

      await refreshAll();
      setSelectedIssueIds([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.bulkUpdateFailed'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function runBulkUpdate(body: Record<string, unknown>, successKey: string) {
    if (selectedIssueIds.length === 0) return;
    setBulkUpdating(true);
    setError(null);
    setInfoMessage(null);
    try {
      const res = await fetch("/api/issues/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: selectedIssueIds, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk update failed");
      }
      const failedCount = Number(data.failedCount ?? 0);
      const updatedCount = Number(data.updatedCount ?? 0);
      if (failedCount > 0) {
        toast.error(t('toasts.bulkFailedLog', { updated: updatedCount, failed: failedCount }));
      } else {
        toast.info(t(successKey, { updated: updatedCount }));
      }
      await refreshAll();
      setSelectedIssueIds([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.bulkUpdateFailed'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function updateBulkPriority() {
    if (bulkPriorityId <= 0) return;
    await runBulkUpdate({ priorityId: bulkPriorityId }, 'toasts.bulkSuccess');
    setBulkPriorityId(0);
  }

  async function handleBoardDrop(issueId: number, targetStatusId: number) {
    try {
      const res = await fetch("/api/issues/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: [issueId], statusId: targetStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Status update failed");
      }
      if (data.failures?.length > 0) {
        throw new Error(data.failures[0].error || t('toasts.actionNotPermitted'));
      }
      toast.info(t('toasts.statusUpdated'));
      await refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.dropFailed'));
      // Refetch to revert KanbanBoard's optimistic state.
      await refreshAll();
    }
  }

  async function updateBulkMarkDone() {
    await runBulkUpdate({ doneRatio: 100 }, 'toasts.bulkSuccess');
  }

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
      <main className="dashboard auth-shell">
        <section className="card auth-panel">
          <div className="auth-grid">
            <div>
              <p className="kicker">{t('login.kickerOps')}</p>
              <h1>{t('login.missionControl')}</h1>
              <p className="muted">
                {t('login.connectRedmineDescription')}
              </p>
            </div>
            <form className="form" onSubmit={connectRedmine}>
              <label>
                {t('login.baseUrlLabel')}
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={t('login.baseUrlPlaceholder')}
                  required
                />
              </label>
              <label>
                {t('login.apiKeyLabel')}
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('login.apiKeyPlaceholder')}
                  required
                />
              </label>
              <button type="submit" disabled={loading}>
                {loading ? t('login.connecting') : t('login.launchDashboard')}
              </button>
              {bootstrapInfo?.configured && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={bootstrapFromEnv}
                  disabled={bootstrapBusy || !bootstrapInfo.canBootstrap}
                >
                  {bootstrapBusy ? t('login.usingEnv') : t('login.useEnvConfig')}
                </button>
              )}
              {bootstrapInfo?.configured && !bootstrapInfo.canBootstrap && (
                <p className="muted">
                  {t('login.envBootstrapHelp', { activeCredentials: bootstrapInfo.activeCredentials })}.
                </p>
              )}
            </form>
          </div>
          {error && <p className="error-banner">{error}</p>}
        </section>
      </main>
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

      <section className="card filters-panel">
        <div className="filters-grid home-filters-grid">
          <label className="filter-field">
            {t('filters.status')}
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}>
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
            <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); resetPage(); }}>
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
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
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
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </label>

          <label className="filter-field">
            {t('filters.searchSource')}
            <select value={searchMode} onChange={(e) => setSearchMode((e.target.value as "local" | "hybrid" | "fts"))}>
              <option value="local">{t('filters.sourceLocal')}</option>
              <option value="hybrid">{t('filters.sourceHybrid')}</option>
              <option value="fts">{t('filters.sourceFts')}</option>
            </select>
            <span className="muted">{t('filters.mode' + (searchMode === "local" ? "Local" : searchMode === "fts" ? "Fts" : "Hybrid"))}</span>
          </label>
        </div>

        <SavedViewsPanel
          savedViews={savedViews}
          activeViewId={activeViewId}
          onApply={(view) => applySavedView(view as SavedView)}
          onDelete={deleteSavedView}
          onReorder={reorderViews}
          onSave={(name) => {
            setViewDraftName(name);
            saveCurrentView();
          }}
          viewDraftName={viewDraftName}
          setViewDraftName={setViewDraftName}
        />

        <div className="home-filters-footer">
          <button
            type="button"
            className={`ai-toggle ${aiSearchOpen ? "active" : ""}`}
            onClick={() => setAiSearchOpen(!aiSearchOpen)}
            disabled={!aiStatus?.available}
          >
            🤖 {t('ai.askAI')} {aiStatus?.available ? "" : `(${t('ai.statusOffline')})`}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setFtsSearchOpen(true)}
          >
            🔍 {t('filters.sourceFts')}
          </button>
        </div>
      </section>

      <section id="summary-insights" className="insights-grid">
        <article className="card">
          <h2>{t('insights.statusMixTitle')}</h2>
          <p className="muted">Click a status to filter quickly.</p>
          <div className="chip-row">
            {summary.topStatuses.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-icon" aria-hidden="true">📊</span>
                <p className="muted">No status data yet.</p>
                <p className="empty-state-hint">
                  Connect to Redmine and run a sync to populate the status mix.
                </p>
              </div>
            )}
            {summary.topStatuses.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`status-chip ${statusFilter === name ? "active" : ""}`}
                onClick={() => setStatusFilter(statusFilter === name ? "" : name)}
              >
                {name} <span>{count}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>{t('insights.priorityMixTitle')}</h2>
          <div className="bars-list">
            {summary.priorityMix.length === 0 && (
              <div className="empty-state">
                <span className="empty-state-icon" aria-hidden="true">🎯</span>
                <p className="muted">No priority data yet.</p>
              </div>
            )}
            {summary.priorityMix.map(([name, count]) => (
              <div key={name} className="bar-row">
                <div className="bar-label-row">
                  <span>{name}</span>
                  <strong>{count}</strong>
                </div>
                <div className="bar-track">
                  <span className="bar-fill priority" style={{ width: `${Math.round((count / Math.max(1, summary.totalVisible)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>



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
        <article id="ops-alerts" className="card">
          <div className="collapsible-head">
            <div>
              <h2>{t('opsAlerts.title')}</h2>
              <p className="muted">{t('opsAlerts.desc')}</p>
            </div>
            <button 
              type="button" 
              className="secondary-button" 
              onClick={() => setOpsAlertsOpen((current) => !current)}
              aria-expanded={opsAlertsOpen}
              aria-controls="ops-alerts-content"
            >
              {opsAlertsOpen ? t('collapsible.collapse') : t('collapsible.expand')}
            </button>
          </div>

          {opsAlertsOpen ? (
            <div id="ops-alerts-content" className="alert-list">
              {summary.atRisk.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden="true">✅</span>
                  <p className="muted">No active risk alerts.</p>
                  <p className="empty-state-hint">
                    Nothing overdue, blocked, or stale right now.{" "}
                    <button
                      type="button"
                      className="link-button"
                      onClick={handleManualPull}
                      disabled={manualRefreshBusy}
                    >
                      {manualRefreshBusy ? t('hero.refreshing') : t('hero.forceRefresh')}
                    </button>{" "}
                    to refresh from Redmine.
                  </p>
                </div>
              )}
              {summary.atRisk.map(({ issue, reason }) => (
                <button
                  key={issue.id}
                  type="button"
                  className={`alert-row ${reason.includes("overdue") ? "tone-critical" : reason.includes("blocked") ? "tone-warning" : "tone-stale"}`}
                  onMouseEnter={() => prefetchIssueDetail(issueRouteId(issue))}
                  onFocus={() => prefetchIssueDetail(issueRouteId(issue))}
                  onClick={() => {
                    openIssueInNewTab(issue);
                  }}
                >
                  <span>
                    {issueDisplayId(issue)} {issue.subject}
                  </span>
                  <span>{reason}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted collapsible-meta">{t('opsAlerts.itemCount', { count: summary.atRisk.length })}</p>
          )}
        </article>

        <article id="activity-feed" className="card activity-card">
          <div className="collapsible-head">
            <div>
              <h2>{t('activityFeed.title')}</h2>
              <p className="muted">{t('activityFeed.desc', { count: summary.recentActivity.length })}</p>
            </div>
            <button 
              type="button" 
              className="secondary-button" 
              onClick={() => setActivityFeedOpen((current) => !current)}
              aria-expanded={activityFeedOpen}
              aria-controls="activity-feed-content"
            >
              {activityFeedOpen ? t('collapsible.collapse') : t('collapsible.expand')}
            </button>
          </div>

          {activityFeedOpen ? (
            <div id="activity-feed-content" className="activity-feed">
              {summary.recentActivity.map((event, idx) => (
                <button
                  key={`${event.issueId}-${event.timestamp}-${idx}`}
                  type="button"
                  className={`activity-row ${event.detail.includes("logged") ? "tone-time" : event.detail.includes("commented") ? "tone-comment" : "tone-update"}`}
                  onMouseEnter={() => prefetchIssueDetail(event.issueId)}
                  onFocus={() => prefetchIssueDetail(event.issueId)}
                  onClick={() => {
                    openIssueIdInNewTab(event.issueId);
                  }}
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
            <p className="muted collapsible-meta">{t('activityFeed.hiddenFeed', { count: summary.recentActivity.length })}</p>
          )}
        </article>

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
                              setFilterPresets([...filterPresets, {
                                id: Date.now().toString(),
                                name: presetNameInput.trim(),
                                statusFilter, priorityFilter, search, showFavoritesOnly,
                                assignedToMe: advancedFilters.assignedToMe,
                              }]);
                              setSavingPreset(false);
                              setPresetNameInput("");
                            } else if (e.key === "Escape") {
                              setSavingPreset(false);
                              setPresetNameInput("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="preset-confirm-btn"
                          disabled={!presetNameInput.trim()}
                          onClick={() => {
                            setFilterPresets([...filterPresets, {
                              id: Date.now().toString(),
                              name: presetNameInput.trim(),
                              statusFilter, priorityFilter, search, showFavoritesOnly,
                            }]);
                            setSavingPreset(false);
                            setPresetNameInput("");
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="preset-cancel-btn"
                          onClick={() => { setSavingPreset(false); setPresetNameInput(""); }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="preset-save-btn"
                        onClick={() => setSavingPreset(true)}
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
                      const issueNumericId =
                        Number.isInteger(issue.redmineIssueId) && issue.redmineIssueId > 0
                          ? issue.redmineIssueId
                          : null;
                      return (
                        <IssueQueueRow
                          key={issue.id}
                          issue={issue}
                          selected={selectedIssueId === issue.redmineIssueId}
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
        {hoveredIssue && (
          <div
            className="issue-preview-tooltip"
            role="tooltip"
            style={{
              left: previewPosition.x,
              top: previewPosition.y,
            }}
          >
            <div className="preview-header">
              <span className="preview-id">{issueDisplayId(hoveredIssue)}</span>
              <span className={`priority-badge priority-${(hoveredIssue.priority ?? "").toLowerCase().replace(/\s+/g, "-")}`}>
                {hoveredIssue.priority}
              </span>
            </div>
            <p className="preview-subject">{hoveredIssue.subject}</p>
            <div className="preview-meta">
              <span>{t('preview.status', { name: hoveredIssue.statusName })}</span>
              <span>{t('preview.progress', { ratio: hoveredIssue.doneRatio ?? 0 })}</span>
            </div>
            {hoveredIssue.dueDate && (
              <div className="preview-due">
                {t('preview.due', { date: new Date(hoveredIssue.dueDate).toLocaleDateString() })}
              </div>
            )}
            {hoveredIssue.description && (
              <p className="preview-desc">
                {hoveredIssue.description.slice(0, 200)}
                {hoveredIssue.description.length > 200 && "..."}
              </p>
            )}
          </div>
        )}
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
