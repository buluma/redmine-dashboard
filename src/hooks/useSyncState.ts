"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

  const requestRef = useRef<AbortController | null>(null);
  const fetchSyncState = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const res = await fetch("/api/sync/status", { signal: controller.signal });
      if (!res.ok) throw new Error("Failed to fetch sync status");
      const data = await res.json();
      if (controller.signal.aborted) return;
      setError(null);
      setSyncState({
        lastSyncAt: data.lastSyncAt,
        lastSyncStatus: data.lastSyncStatus,
        lastError: data.lastError,
        isRunning: data.syncActive ?? false,
        syncProgress: data.progress ?? 0,
      });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load sync state");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
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
    void fetchSyncState();

    const interval = setInterval(fetchSyncState, POLL_INTERVAL);
    return () => { clearInterval(interval); requestRef.current?.abort(); };
  }, [fetchSyncState]);

  return {
    syncState,
    loading,
    error,
    refreshSyncState: fetchSyncState,
    triggerManualSync,
  };
}