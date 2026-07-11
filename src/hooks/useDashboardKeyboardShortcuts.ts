"use client";

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

export interface UseDashboardKeyboardShortcutsParams {
  showShortcutHelp: boolean;
  setShowShortcutHelp: Dispatch<SetStateAction<boolean>>;
  selectedIssueId: number | null;
  setSelectedIssueId: (id: number | null) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  resetFilters: () => void;
  manualRefreshBusy: boolean;
  onManualPull: () => void;
  aiAvailable: boolean;
  setAiSearchOpen: Dispatch<SetStateAction<boolean>>;
}

/** Global dashboard keyboard shortcuts: /, f, r, g, o, ?, a, Alt+1-4, Escape. */
export function useDashboardKeyboardShortcuts({
  showShortcutHelp,
  setShowShortcutHelp,
  selectedIssueId,
  setSelectedIssueId,
  searchInputRef,
  resetFilters,
  manualRefreshBusy,
  onManualPull,
  aiAvailable,
  setAiSearchOpen,
}: UseDashboardKeyboardShortcutsParams) {
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
        void onManualPull();
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

      if (event.key.toLowerCase() === "a" && aiAvailable) {
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
}
