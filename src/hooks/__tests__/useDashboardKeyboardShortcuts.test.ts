import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";

import { useDashboardKeyboardShortcuts } from "@/src/hooks/useDashboardKeyboardShortcuts";

function fireKey(key: string, opts: Partial<KeyboardEventInit> & { target?: EventTarget } = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, ...opts });
  if (opts.target) {
    Object.defineProperty(event, "target", { value: opts.target, configurable: true });
  }
  window.dispatchEvent(event);
  return event;
}

function baseParams(overrides: Partial<Parameters<typeof useDashboardKeyboardShortcuts>[0]> = {}) {
  return {
    showShortcutHelp: false,
    setShowShortcutHelp: vi.fn(),
    selectedIssueId: null,
    setSelectedIssueId: vi.fn(),
    searchInputRef: createRef<HTMLInputElement>(),
    resetFilters: vi.fn(),
    manualRefreshBusy: false,
    onManualPull: vi.fn(),
    aiAvailable: false,
    setAiSearchOpen: vi.fn(),
    ...overrides,
  };
}

describe("useDashboardKeyboardShortcuts", () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    assignSpy = vi.fn();
    // @ts-expect-error -- test-only override of window.location.assign
    delete window.location;
    // @ts-expect-error -- test-only partial location
    window.location = { ...originalLocation, assign: assignSpy };
  });

  afterEach(() => {
    // @ts-expect-error -- test-only restore of window.location
    window.location = originalLocation;
  });

  it("Escape closes shortcut help first if it's open", () => {
    const params = baseParams({ showShortcutHelp: true, selectedIssueId: 5 });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("Escape");
    expect(params.setShowShortcutHelp).toHaveBeenCalledWith(false);
    expect(params.setSelectedIssueId).not.toHaveBeenCalled();
  });

  it("Escape clears the selected issue when shortcut help is closed", () => {
    const params = baseParams({ showShortcutHelp: false, selectedIssueId: 5 });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("Escape");
    expect(params.setSelectedIssueId).toHaveBeenCalledWith(null);
  });

  it("/ focuses the search input", () => {
    const params = baseParams();
    const input = document.createElement("input");
    document.body.appendChild(input);
    params.searchInputRef.current = input;
    const focusSpy = vi.spyOn(input, "focus");
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("/");
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores shortcuts while typing in a text field", () => {
    const params = baseParams();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("f", { target: input });
    expect(params.resetFilters).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("f resets filters", () => {
    const params = baseParams();
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("f");
    expect(params.resetFilters).toHaveBeenCalledTimes(1);
  });

  it("r triggers a manual pull when not already busy", () => {
    const params = baseParams({ manualRefreshBusy: false });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("r");
    expect(params.onManualPull).toHaveBeenCalledTimes(1);
  });

  it("r does nothing while a manual pull is already busy", () => {
    const params = baseParams({ manualRefreshBusy: true });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("r");
    expect(params.onManualPull).not.toHaveBeenCalled();
  });

  it("g navigates to /reports", () => {
    const params = baseParams();
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("g");
    expect(assignSpy).toHaveBeenCalledWith("/reports");
  });

  it("o navigates to /ops", () => {
    const params = baseParams();
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("o");
    expect(assignSpy).toHaveBeenCalledWith("/ops");
  });

  it("? toggles shortcut help", () => {
    const params = baseParams();
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("?");
    expect(params.setShowShortcutHelp).toHaveBeenCalledTimes(1);
    const updater = (params.setShowShortcutHelp as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof updater === "function" ? updater(false) : updater).toBe(true);
  });

  it("a toggles AI search only when AI is available", () => {
    const params = baseParams({ aiAvailable: false });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("a");
    expect(params.setAiSearchOpen).not.toHaveBeenCalled();
  });

  it("a toggles AI search when AI is available", () => {
    const params = baseParams({ aiAvailable: true });
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("a");
    expect(params.setAiSearchOpen).toHaveBeenCalledTimes(1);
  });

  it("Alt+1 scrolls to the summary-insights section", () => {
    const params = baseParams();
    const el = document.createElement("div");
    el.id = "summary-insights";
    document.body.appendChild(el);
    const scrollSpy = vi.fn();
    // jsdom doesn't implement scrollIntoView at all.
    el.scrollIntoView = scrollSpy;
    renderHook(() => useDashboardKeyboardShortcuts(params));
    fireKey("1", { altKey: true });
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    document.body.removeChild(el);
  });

  it("removes the listener on unmount", () => {
    const params = baseParams();
    const { unmount } = renderHook(() => useDashboardKeyboardShortcuts(params));
    unmount();
    fireKey("f");
    expect(params.resetFilters).not.toHaveBeenCalled();
  });
});
