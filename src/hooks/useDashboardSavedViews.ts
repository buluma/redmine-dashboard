"use client";

import { useCallback, useEffect, useState } from "react";

import { matchesView } from "@/src/lib/issue-utils";
import type { SavedView } from "@/src/types/dashboard";

const SAVED_VIEWS_KEY = "nrcc.savedViews.v1";

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
  ) => Promise<{ view: SavedView; replaced: boolean }>;
  deleteView: (viewId: string) => Promise<SavedView | undefined>;
  reorderViews: (viewIds: string[]) => Promise<void>;
  clearActiveIfDiverged: (
    snapshot: Pick<
      ViewSnapshot,
      "statusFilter" | "priorityFilter" | "search" | "sort"
    >,
  ) => void;
}

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const view = value as Partial<SavedView>;
  return (
    typeof view.id === "string" &&
    typeof view.name === "string" &&
    typeof view.statusFilter === "string" &&
    typeof view.priorityFilter === "string" &&
    typeof view.search === "string" &&
    typeof view.sort === "string" &&
    typeof view.assignedToMe === "boolean"
  );
}

function readLegacyViews(): SavedView[] {
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || `Saved view request failed: ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}

export function useDashboardSavedViews(): UseDashboardSavedViewsResult {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewDraftName, setViewDraftName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const legacyViews = readLegacyViews();
      try {
        const data = await responseJson<{ views: SavedView[] }>(
          await fetch("/api/saved-views", { cache: "no-store" }),
        );
        if (cancelled) return;

        if (data.views.length > 0 || legacyViews.length === 0) {
          setSavedViews(data.views);
          return;
        }

        const migrated = await responseJson<{ views: SavedView[] }>(
          await fetch("/api/saved-views/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              views: legacyViews.map((view) => ({
                name: view.name,
                filters: {
                  statusFilter: view.statusFilter,
                  priorityFilter: view.priorityFilter,
                  search: view.search,
                  sort: view.sort,
                  assignedToMe: view.assignedToMe,
                },
              })),
            }),
          }),
        );

        if (!cancelled) {
          window.localStorage.removeItem(SAVED_VIEWS_KEY);
          setSavedViews(migrated.views);
        }
      } catch {
        // Keep legacy state until a future hydration can migrate it safely.
        if (!cancelled) setSavedViews(legacyViews);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearActiveIfDiverged = useCallback(
    (
      snapshot: Pick<
        ViewSnapshot,
        "statusFilter" | "priorityFilter" | "search" | "sort"
      >,
    ) => {
      if (!activeViewId) return;
      const active = savedViews.find((view) => view.id === activeViewId);
      if (!active || !matchesView(active, snapshot)) setActiveViewId(null);
    },
    [activeViewId, savedViews],
  );

  const saveView = useCallback(
    async (snapshot: ViewSnapshot, fallbackName: string) => {
      const name = viewDraftName.trim() || fallbackName;
      const existing = savedViews.find(
        (view) => view.name.toLowerCase() === name.toLowerCase(),
      );
      const previousViews = savedViews;
      const previousActiveViewId = activeViewId;
      const optimisticView: SavedView = {
        id: existing?.id ?? `local-${Date.now()}`,
        name,
        ...snapshot,
        position: existing?.position ?? savedViews.length,
      };

      setSavedViews((current) =>
        existing
          ? current.map((view) =>
              view.id === existing.id ? optimisticView : view,
            )
          : [...current, optimisticView],
      );
      setActiveViewId(optimisticView.id);
      setViewDraftName("");

      try {
        const endpoint = existing
          ? `/api/saved-views/${existing.id}`
          : "/api/saved-views";
        const response = await fetch(endpoint, {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, filters: snapshot }),
        });
        const data = await responseJson<{ view: SavedView }>(response);
        setSavedViews((current) =>
          existing
            ? current.map((view) =>
                view.id === existing.id ? data.view : view,
              )
            : current.map((view) =>
                view.id === optimisticView.id ? data.view : view,
              ),
        );
        setActiveViewId(data.view.id);
        return { view: data.view, replaced: Boolean(existing) };
      } catch (error) {
        setSavedViews(previousViews);
        setActiveViewId(previousActiveViewId);
        throw error;
      }
    },
    [activeViewId, savedViews, viewDraftName],
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      const target = savedViews.find((view) => view.id === viewId);
      if (!target) return undefined;
      const previousViews = savedViews;
      const previousActiveViewId = activeViewId;
      setSavedViews((current) => current.filter((view) => view.id !== viewId));
      if (activeViewId === viewId) setActiveViewId(null);

      try {
        await responseJson<{ ok: true }>(
          await fetch(`/api/saved-views/${viewId}`, { method: "DELETE" }),
        );
        return target;
      } catch (error) {
        setSavedViews(previousViews);
        setActiveViewId(previousActiveViewId);
        throw error;
      }
    },
    [activeViewId, savedViews],
  );

  const reorderViews = useCallback(
    async (viewIds: string[]) => {
      const previousViews = savedViews;
      const positions = new Map(viewIds.map((id, index) => [id, index]));
      if (
        positions.size !== savedViews.length ||
        savedViews.some((view) => !positions.has(view.id))
      ) {
        throw new Error("Saved view reorder does not match the current views");
      }

      setSavedViews((current) =>
        current
          .map((view) => ({ ...view, position: positions.get(view.id) }))
          .sort((left, right) => (left.position ?? 0) - (right.position ?? 0)),
      );

      try {
        await responseJson(
          await fetch("/api/saved-views/reorder", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewIds }),
          }),
        );
      } catch (error) {
        setSavedViews(previousViews);
        throw error;
      }
    },
    [savedViews],
  );

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
