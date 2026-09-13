import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardSavedViews } from "@/src/hooks/useDashboardSavedViews";

const STORAGE_KEY = "nrcc.savedViews.v1";

function snapshot(
  overrides: Partial<{
    statusFilter: string;
    priorityFilter: string;
    search: string;
    sort: string;
    assignedToMe: boolean;
  }> = {},
) {
  return {
    statusFilter: "",
    priorityFilter: "",
    search: "",
    sort: "updated_desc",
    assignedToMe: false,
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useDashboardSavedViews", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
      if (!init?.method || init.method === "GET") return json({ views: [] });
      if (init.method === "DELETE") return json({ ok: true });
      if (init.method === "PATCH" && String(_input).endsWith("/reorder"))
        return json({ success: true });

      const body = JSON.parse(String(init.body));
      return json({
        view: {
          id: "server-view",
          name: body.name,
          ...body.filters,
          position: 0,
          updatedAt: "2026-09-13T00:00:00.000Z",
        },
      });
    });
  });

  it("hydrates server views instead of local storage when they exist", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "legacy", name: "Legacy", ...snapshot() }]),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        views: [
          {
            id: "server",
            name: "Shared",
            ...snapshot({ statusFilter: "Open" }),
            position: 0,
          },
        ],
      }),
    );

    const { result } = renderHook(() => useDashboardSavedViews());

    await waitFor(() =>
      expect(result.current.savedViews[0]?.name).toBe("Shared"),
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("migrates legacy views once when the server has none", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "legacy", name: "Legacy", ...snapshot({ statusFilter: "Open" }) },
      ]),
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ views: [] }))
      .mockResolvedValueOnce(
        json({
          views: [
            {
              id: "server",
              name: "Legacy",
              ...snapshot({ statusFilter: "Open" }),
              position: 0,
            },
          ],
        }),
      );

    const { result } = renderHook(() => useDashboardSavedViews());

    await waitFor(() =>
      expect(result.current.savedViews[0]?.id).toBe("server"),
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/saved-views/import",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("re-fetches the server list instead of using stale legacy ids when import loses a migration race", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "legacy", name: "Legacy", ...snapshot({ statusFilter: "Open" }) },
      ]),
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ views: [] })) // initial GET: server empty
      .mockResolvedValueOnce(json({ error: "Saved views already exist" }, 409)) // import loses the race
      .mockResolvedValueOnce(
        json({
          // the winning tab's import already landed
          views: [
            { id: "winner", name: "Legacy", ...snapshot({ statusFilter: "Open" }), position: 0 },
          ],
        }),
      );

    const { result } = renderHook(() => useDashboardSavedViews());

    await waitFor(() =>
      expect(result.current.savedViews[0]?.id).toBe("winner"),
    );
    // The other tab's views are now authoritative — legacy snapshot is done.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("keeps the legacy snapshot in localStorage when the import fails and the server is still genuinely empty", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "legacy", name: "Legacy", ...snapshot({ statusFilter: "Open" }) },
      ]),
    );
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ views: [] })) // initial GET: server empty
      .mockResolvedValueOnce(json({ error: "Failed to import saved views" }, 500)) // real failure
      .mockResolvedValueOnce(json({ views: [] })); // re-fetch: still empty, not a race

    const { result } = renderHook(() => useDashboardSavedViews());

    await waitFor(() =>
      expect(result.current.savedViews[0]?.id).toBe("legacy"),
    );
    // Kept so a later hydration can retry the migration instead of losing it.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("rejects a reorder list with a duplicate id even when every existing id is present", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        views: [
          { id: "a", name: "A", ...snapshot(), position: 0 },
          { id: "b", name: "B", ...snapshot(), position: 1 },
        ],
      }),
    );
    const { result } = renderHook(() => useDashboardSavedViews());
    await waitFor(() => expect(result.current.savedViews).toHaveLength(2));

    await expect(
      act(async () => result.current.reorderViews(["a", "b", "a"])),
    ).rejects.toThrow("Saved view reorder does not match the current views");
    // Order is untouched — the bogus reorder never got applied.
    expect(result.current.savedViews.map((view) => view.id)).toEqual(["a", "b"]);
  });

  it("creates a view through the API and marks the server view active", async () => {
    const { result } = renderHook(() => useDashboardSavedViews());
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    let saved: Awaited<ReturnType<typeof result.current.saveView>>;
    await act(async () => {
      saved = await result.current.saveView(
        snapshot({ statusFilter: "Open" }),
        "fallback",
      );
    });

    expect(saved!.replaced).toBe(false);
    expect(saved!.view.id).toBe("server-view");
    expect(result.current.activeViewId).toBe("server-view");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/saved-views",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rolls back an optimistic delete when the API rejects it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          views: [{ id: "server", name: "Shared", ...snapshot(), position: 0 }],
        }),
      )
      .mockResolvedValueOnce(json({ error: "Saved view not found" }, 404));
    const { result } = renderHook(() => useDashboardSavedViews());
    await waitFor(() => expect(result.current.savedViews).toHaveLength(1));

    await expect(
      act(async () => result.current.deleteView("server")),
    ).rejects.toThrow("Saved view not found");
    expect(result.current.savedViews).toHaveLength(1);
  });

  it("posts the complete reordered server view id list", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json({
          views: [
            { id: "a", name: "A", ...snapshot(), position: 0 },
            { id: "b", name: "B", ...snapshot(), position: 1 },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ success: true }));
    const { result } = renderHook(() => useDashboardSavedViews());
    await waitFor(() => expect(result.current.savedViews).toHaveLength(2));

    await act(async () => result.current.reorderViews(["b", "a"]));

    expect(result.current.savedViews.map((view) => view.id)).toEqual([
      "b",
      "a",
    ]);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/saved-views/reorder",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
