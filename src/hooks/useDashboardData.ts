"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { useToast } from "@/src/components/ToastProvider";
import { useEventStream } from "@/src/hooks/useEventStream";
import { uniqueStrings } from "@/src/lib/issue-utils";
import type {
  BootstrapInfo,
  Issue,
  StatusCatalog,
  SyncState,
  User,
} from "@/src/types/dashboard";

const POLL_INTERVAL_MS = 90_000;
const FETCH_PAGE_SIZE = 200;
// A sync run emits one issue.created/issue.updated SSE event per issue
// touched. Coalesce a fast burst into a single refreshAll() after the
// stream goes quiet for this long...
const SSE_REFRESH_DEBOUNCE_MS = 1_000;
// ...but a slow sync (Redmine round-trips spaced seconds apart) never goes
// quiet long enough to hit that window, so cap how long a stream of events
// can defer a refresh before one fires anyway. The poller's
// sync.tick.completed event (below) is the real completion signal and
// fires a refresh immediately, making this a backstop for long-running ticks.
const SSE_REFRESH_MAX_WAIT_MS = 5_000;

interface AiStatusInfo {
  available: boolean;
  primaryModel: string;
  usingFallback: boolean;
}

export interface UseDashboardDataParams {
  queryString: string;
  onIssuesPageReset: () => void;
}

export interface UseDashboardDataResult {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  issues: Issue[];
  setIssues: Dispatch<SetStateAction<Issue[]>>;
  total: number;
  statuses: StatusCatalog[];
  priorities: string[];
  syncState: SyncState;
  setSyncState: Dispatch<SetStateAction<SyncState>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  favoriteIssueIds: number[];
  bootstrapInfo: BootstrapInfo;
  aiStatus: AiStatusInfo | null;
  aiSummaryCount: number;
  refreshAll: () => Promise<void>;
  loadActivities: () => Promise<void>;
  loadFavorites: () => Promise<void>;
  loadBootstrapInfo: () => Promise<void>;
}

export function useDashboardData({
  queryString,
  onIssuesPageReset,
}: UseDashboardDataParams): UseDashboardDataResult {
  const toast = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState<StatusCatalog[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteIssueIds, setFavoriteIssueIds] = useState<number[]>([]);
  const [bootstrapInfo, setBootstrapInfo] = useState<BootstrapInfo>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusInfo | null>(null);
  const [aiSummaryCount, setAiSummaryCount] = useState(0);
  const [activityId, setActivityId] = useState(0);

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
    const res = await fetch(`/api/issues?${queryString}&pageSize=${FETCH_PAGE_SIZE}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to load issues");
    }

    const data = await res.json();
    setIssues(data.items ?? []);
    setTotal(data.total ?? 0);
    setStatuses(data.filters?.statuses ?? []);
    setPriorities(uniqueStrings(data.filters?.priorities ?? []));
    onIssuesPageReset();
  }

  async function loadActivities() {
    if (!user) return;
    const res = await fetch("/api/internal/activities", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const fetched = data.activities ?? [];
      if (fetched.length > 0 && activityId === 0) {
        setActivityId(fetched[0].id);
      }
    }
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

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadSession(), loadBootstrapInfo(), loadAiStatus(), loadAiSummaryCount()]);
      } finally {
        setLoading(false);
      }
    })();
    // Startup load, intentionally runs once.
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
  const sseQuietTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseMaxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSseTimers = () => {
    if (sseQuietTimerRef.current) clearTimeout(sseQuietTimerRef.current);
    if (sseMaxWaitTimerRef.current) clearTimeout(sseMaxWaitTimerRef.current);
    sseQuietTimerRef.current = null;
    sseMaxWaitTimerRef.current = null;
  };
  useEffect(() => clearSseTimers, []);
  const fireSseRefresh = () => {
    clearSseTimers();
    void refreshAll();
  };
  const scheduleSseRefresh = () => {
    if (sseQuietTimerRef.current) clearTimeout(sseQuietTimerRef.current);
    sseQuietTimerRef.current = setTimeout(fireSseRefresh, SSE_REFRESH_DEBOUNCE_MS);
    if (!sseMaxWaitTimerRef.current) {
      sseMaxWaitTimerRef.current = setTimeout(fireSseRefresh, SSE_REFRESH_MAX_WAIT_MS);
    }
  };
  useEventStream({
    enabled: Boolean(user),
    handlers: {
      "issue.created": scheduleSseRefresh,
      "issue.updated": scheduleSseRefresh,
      // Authoritative "the sync batch is done" signal from the poller —
      // refresh right away instead of waiting out the debounce/max-wait.
      "sync.tick.completed": fireSseRefresh,
    },
  });

  return {
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
    loadFavorites,
    loadBootstrapInfo,
  };
}
