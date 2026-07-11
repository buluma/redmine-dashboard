"use client";

import { useState, useEffect, useCallback } from "react";

export interface SavedView {
  id: string;
  name: string;
  filters: {
    project?: string | null;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    // Advanced filters (to be added)
    statusIds?: number[];
    priorityIds?: number[];
    assignedToMe?: boolean;
    dueInDays?: number | null;
  };
  createdAt: string;
  isDefault?: boolean;
}

const STORAGE_KEY = "converge_saved_views";
const DEFAULT_VIEW_KEY = "converge_default_view";

export interface UseSavedViewsResult {
  views: SavedView[];
  currentViewId: string | null;
  setCurrentView: (viewId: string | null) => void;
  saveView: (name: string, filters: SavedView["filters"]) => void;
  deleteView: (viewId: string) => void;
  renameView: (viewId: string, newName: string) => void;
  setDefaultView: (viewId: string) => void;
  getCurrentFilters: () => SavedView["filters"] | null;
}

export function useSavedViews(): UseSavedViewsResult {
  const [views, setViews] = useState<SavedView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);

  // Load from localStorage on mount — external-system sync, not derivable
  // during render.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViews(parsed);
      }
      
      const defaultId = localStorage.getItem(DEFAULT_VIEW_KEY);
      if (defaultId) {
        setCurrentViewId(defaultId);
      }
    } catch (e) {
      console.error("Failed to load saved views:", e);
    }
  }, []);

  // Persist to localStorage when views change
  const persistViews = useCallback((updatedViews: SavedView[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedViews));
      setViews(updatedViews);
    } catch (e) {
      console.error("Failed to save views:", e);
    }
  }, []);

  const saveView = useCallback((name: string, filters: SavedView["filters"]) => {
    const newView: SavedView = {
      id: `view_${Date.now()}`,
      name,
      filters,
      createdAt: new Date().toISOString(),
    };
    persistViews([...views, newView]);
    setCurrentViewId(newView.id);
    localStorage.setItem(DEFAULT_VIEW_KEY, newView.id);
  }, [views, persistViews]);

  const deleteView = useCallback((viewId: string) => {
    const updated = views.filter(v => v.id !== viewId);
    persistViews(updated);
    if (currentViewId === viewId) {
      setCurrentViewId(null);
      localStorage.removeItem(DEFAULT_VIEW_KEY);
    }
  }, [views, currentViewId, persistViews]);

  const renameView = useCallback((viewId: string, newName: string) => {
    const updated = views.map(v => v.id === viewId ? { ...v, name: newName } : v);
    persistViews(updated);
  }, [views, persistViews]);

  const setDefaultView = useCallback((viewId: string) => {
    localStorage.setItem(DEFAULT_VIEW_KEY, viewId);
  }, []);

  const setCurrentView = useCallback((viewId: string | null) => {
    setCurrentViewId(viewId);
    if (viewId) {
      localStorage.setItem(DEFAULT_VIEW_KEY, viewId);
    } else {
      localStorage.removeItem(DEFAULT_VIEW_KEY);
    }
  }, []);

  const getCurrentFilters = useCallback(() => {
    if (!currentViewId) return null;
    const view = views.find(v => v.id === currentViewId);
    return view?.filters || null;
  }, [currentViewId, views]);

  return {
    views,
    currentViewId,
    setCurrentView,
    saveView,
    deleteView,
    renameView,
    setDefaultView,
    getCurrentFilters,
  };
}