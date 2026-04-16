"use client";

import { useState, useEffect, useCallback } from "react";

export interface SyncState {
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "failed" | null;
  lastError: string | null;
  isRunning: boolean;
  syncProgress: number;
}

export interface UseSyncStateResult {
  syncState: SyncState | null;
  loading: boolean;
  error: string | null;
  refreshSyncState: () => Promise<void>;
  triggerManualSync: () => Promise<{ ok: boolean; jobId?: string; error?: string }>;
}

const POLL_INTERVAL = 30000; // 30 seconds

export function useSyncState(): UseSyncStateResult {
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshBusy, setManualRefreshBusy] = useState(false);

  const fetchSyncState = useCallback(async () => {
    try {
      const res = await fetch("/api/sync/status");
      if (!res.ok) throw new Error("Failed to fetch sync status");
      const data = await res.json();
      setSyncState({
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastError: data.lastError,
        isRunning: data.syncActive ?? false,
        syncProgress: data.progress ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sync state");
    }
  }, []);

  const triggerManualSync = useCallback(async () => {
    if (manualRefreshBusy) {
      return { ok: false, error: "Already syncing" };
    }
    setManualRefreshBusy(true);
    try {
      const res = await fetch("/api/sync/manual-pull", { method: "POST" });
      const data = await res.json();
      setManualRefreshBusy(false);
      if (res.ok) {
        return { ok: true, jobId: data.jobId };
      }
      return { ok: false, error: data.error || "Sync failed" };
    } catch (err) {
      setManualRefreshBusy(false);
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }, [manualRefreshBusy]);

  useEffect(() => {
    fetchSyncState().finally(() => setLoading(false));

    const interval = setInterval(fetchSyncState, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSyncState]);

  return {
    syncState,
    loading,
    error,
    refreshSyncState: fetchSyncState,
    triggerManualSync,
  };
}