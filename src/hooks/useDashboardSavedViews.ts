"use client";

import { useCallback, useEffect, useState } from "react";

import { matchesView } from "@/src/lib/issue-utils";
import type { SavedView } from "@/src/types/dashboard";

const SAVED_VIEWS_KEY = "nrcc.savedViews.v1";
const MAX_VIEWS = 12;

export interface ViewSnapshot {
  statusFilter: string;
  priorityFilter: string;
  search: string;
  sort: string;
  assignedToMe: boolean;
}

export interface UseDashboardSavedViewsResult {
  savedViews: SavedView[];
  activeViewId: string | null;
  setActiveViewId: (id: string | null) => void;
  viewDraftName: string;
  setViewDraftName: (name: string) => void;
  saveView: (
    snapshot: ViewSnapshot,
    fallbackName: string,
  ) => { view: SavedView; replaced: boolean };
  deleteView: (viewId: string) => SavedView | undefined;
  reorderViews: (viewIds: string[]) => Promise<void>;
  clearActiveIfDiverged: (
    snapshot: Pick<ViewSnapshot, "statusFilter" | "priorityFilter" | "search" | "sort">,
  ) => void;
}

export function useDashboardSavedViews(): UseDashboardSavedViewsResult {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewDraftName, setViewDraftName] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedView[];
      if (Array.isArray(parsed)) {
        setSavedViews(
          parsed.filter(
            (item) => typeof item?.id === "string" && typeof item?.name === "string",
          ),
        );
      }
    } catch {
      window.localStorage.removeItem(SAVED_VIEWS_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  const clearActiveIfDiverged = useCallback(
    (snapshot: Pick<ViewSnapshot, "statusFilter" | "priorityFilter" | "search" | "sort">) => {
      if (!activeViewId) return;
      const active = savedViews.find((v) => v.id === activeViewId);
      if (!active) {
        setActiveViewId(null);
        return;
      }
      if (!matchesView(active, snapshot)) {
        setActiveViewId(null);
      }
    },
    [activeViewId, savedViews],
  );

  const saveView = useCallback(
    (snapshot: ViewSnapshot, fallbackName: string) => {
      const name = viewDraftName.trim() || fallbackName;
      const existing = savedViews.find(
        (v) => v.name.toLowerCase() === name.toLowerCase(),
      );
      const nextView: SavedView = {
        id: existing?.id ?? `${Date.now()}`,
        name,
        statusFilter: snapshot.statusFilter,
        priorityFilter: snapshot.priorityFilter,
        search: snapshot.search,
        sort: snapshot.sort,
        position: existing?.position ?? savedViews.length,
        assignedToMe: snapshot.assignedToMe,
      };
      if (existing) {
        setSavedViews((current) =>
          current.map((v) => (v.id === existing.id ? nextView : v)),
        );
      } else {
        setSavedViews((current) => [nextView, ...current].slice(0, MAX_VIEWS));
      }
      setActiveViewId(nextView.id);
      setViewDraftName("");
      return { view: nextView, replaced: Boolean(existing) };
    },
    [savedViews, viewDraftName],
  );

  const deleteView = useCallback(
    (viewId: string): SavedView | undefined => {
      const target = savedViews.find((view) => view.id === viewId);
      setSavedViews((current) => current.filter((view) => view.id !== viewId));
      if (activeViewId === viewId) setActiveViewId(null);
      return target;
    },
    [savedViews, activeViewId],
  );

  const reorderViews = useCallback(async (viewIds: string[]) => {
    try {
      const res = await fetch("/api/saved-views/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewIds }),
      });
      if (!res.ok) {
        console.error("Failed to reorder saved views:", await res.text());
      }
    } catch (err) {
      console.error("Reorder saved views error:", err);
    }
  }, []);

  return {
    savedViews,
    activeViewId,
    setActiveViewId,
    viewDraftName,
    setViewDraftName,
    saveView,
    deleteView,
    reorderViews,
    clearActiveIfDiverged,
  };
}
