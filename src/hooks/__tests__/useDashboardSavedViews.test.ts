import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { useDashboardSavedViews } from "@/src/hooks/useDashboardSavedViews";

const STORAGE_KEY = "nrcc.savedViews.v1";

function snapshot(overrides: Partial<{
  statusFilter: string;
  priorityFilter: string;
  search: string;
  sort: string;
  assignedToMe: boolean;
}> = {}) {
  return {
    statusFilter: "",
    priorityFilter: "",
    search: "",
    sort: "updated_desc",
    assignedToMe: false,
    ...overrides,
  };
}

describe("useDashboardSavedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts empty when localStorage has no views", () => {
    const { result } = renderHook(() => useDashboardSavedViews());
    expect(result.current.savedViews).toEqual([]);
    expect(result.current.activeViewId).toBeNull();
  });

  it("hydrates from localStorage on mount", () => {
    const seeded = [
      {
        id: "v1",
        name: "Mine",
        statusFilter: "Open",
        priorityFilter: "",
        search: "",
        sort: "updated_desc",
        position: 0,
        assignedToMe: true,
      },
    ];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    const { result } = renderHook(() => useDashboardSavedViews());
    expect(result.current.savedViews).toHaveLength(1);
    expect(result.current.savedViews[0]?.name).toBe("Mine");
  });

  it("saves a new view, marks it active, and persists to localStorage", () => {
    const { result } = renderHook(() => useDashboardSavedViews());

    act(() => {
      const r = result.current.saveView(snapshot({ statusFilter: "Open" }), "fallback");
      expect(r.replaced).toBe(false);
      expect(r.view.statusFilter).toBe("Open");
    });

    expect(result.current.savedViews).toHaveLength(1);
    expect(result.current.activeViewId).toBe(result.current.savedViews[0]?.id);
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"statusFilter":"Open"');
  });

  it("replaces an existing view of the same (case-insensitive) name", () => {
    const { result } = renderHook(() => useDashboardSavedViews());

    act(() => result.current.setViewDraftName("My View"));
    act(() => {
      result.current.saveView(snapshot({ statusFilter: "Open" }), "fallback-1");
    });
    act(() => result.current.setViewDraftName("my view"));
    act(() => {
      const r = result.current.saveView(
        snapshot({ statusFilter: "Closed" }),
        "fallback-2",
      );
      expect(r.replaced).toBe(true);
    });

    expect(result.current.savedViews).toHaveLength(1);
    expect(result.current.savedViews[0]?.statusFilter).toBe("Closed");
  });

  it("deletes a view and returns it; clears active when matching", () => {
    const { result } = renderHook(() => useDashboardSavedViews());
    act(() => result.current.saveView(snapshot(), "fallback"));
    const id = result.current.savedViews[0]?.id ?? "";

    act(() => {
      const target = result.current.deleteView(id);
      expect(target?.id).toBe(id);
    });

    expect(result.current.savedViews).toHaveLength(0);
    expect(result.current.activeViewId).toBeNull();
  });

  it("clears active view when filters diverge from saved snapshot", () => {
    const { result } = renderHook(() => useDashboardSavedViews());
    act(() => result.current.saveView(snapshot({ statusFilter: "Open" }), "fallback"));
    expect(result.current.activeViewId).not.toBeNull();

    act(() => {
      result.current.clearActiveIfDiverged({
        statusFilter: "Closed",
        priorityFilter: "",
        search: "",
        sort: "updated_desc",
      });
    });

    expect(result.current.activeViewId).toBeNull();
  });

  it("posts reorder updates to the API", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { result } = renderHook(() => useDashboardSavedViews());

    await act(async () => {
      await result.current.reorderViews(["a", "b"]);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/saved-views/reorder");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ viewIds: ["a", "b"] }));
  });
});
