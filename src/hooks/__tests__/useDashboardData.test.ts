import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useDashboardData } from "@/src/hooks/useDashboardData";

const toastError = vi.fn();
const eventStreamCalls: unknown[] = [];

vi.mock("@/src/components/ToastProvider", () => ({
  useToast: () => ({ error: toastError, info: vi.fn(), success: vi.fn(), show: vi.fn(), clearAll: vi.fn() }),
}));

vi.mock("@/src/hooks/useEventStream", () => ({
  useEventStream: (opts: unknown) => { eventStreamCalls.push(opts); },
}));

function jsonResponse(body: unknown, ok = true, contentType = "application/json") {
  return {
    ok,
    headers: { get: () => contentType },
    json: async () => body,
  } as unknown as Response;
}

function renderData(overrides: Partial<Parameters<typeof useDashboardData>[0]> = {}) {
  const params = {
    queryString: "sort=updated_desc",
    onIssuesPageReset: vi.fn(),
    ...overrides,
  };
  return renderHook(() => useDashboardData(params));
}

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn());
    toastError.mockClear();
    eventStreamCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads session/bootstrap/AI status in parallel on mount and clears loading", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
      if (url.includes("/api/redmine/bootstrap")) return jsonResponse({ configured: true, canBootstrap: true, activeCredentials: 1 });
      if (url.includes("/api/ai/status")) return jsonResponse({ available: true, primaryModel: "x", usingFallback: false });
      if (url.includes("/api/ai/summary-count")) return jsonResponse({ count: 3 });
      if (url.includes("/api/issues/favorites")) return jsonResponse({ favorites: [] });
      if (url.includes("/api/issues?")) return jsonResponse({ items: [], total: 0, filters: {} });
      if (url.includes("/api/sync/status")) return jsonResponse({ state: null });
      if (url.includes("/api/internal/activities")) return jsonResponse({ activities: [] });
      return jsonResponse({});
    });

    const { result } = renderData();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ id: "u1", username: "a", displayName: "A" });
    expect(result.current.bootstrapInfo).toEqual({ configured: true, canBootstrap: true, activeCredentials: 1 });
    expect(result.current.aiStatus).toEqual({ available: true, primaryModel: "x", usingFallback: false });
    expect(result.current.aiSummaryCount).toBe(3);
  });

  it("treats a non-JSON /api/session/me response as signed out", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session/me")) return jsonResponse({}, true, "text/html");
      return jsonResponse({});
    });
    const { result } = renderData();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  describe("once a user is present", () => {
    async function mountWithUser() {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
        if (url.includes("/api/issues?")) return jsonResponse({ items: [{ id: "1" }], total: 1, filters: { statuses: [], priorities: [] } });
        if (url.includes("/api/sync/status")) return jsonResponse({ state: { lastSyncStatus: "success" } });
        if (url.includes("/api/internal/activities")) return jsonResponse({ activities: [{ id: 42 }] });
        if (url.includes("/api/issues/favorites")) return jsonResponse({ favorites: [7] });
        return jsonResponse({});
      });
      const hook = renderData();
      await waitFor(() => expect(hook.result.current.user).not.toBeNull());
      return hook;
    }

    it("triggers refreshAll/loadActivities/loadFavorites once a user appears", async () => {
      const { result } = await mountWithUser();
      await waitFor(() => expect(result.current.issues).toHaveLength(1));
      expect(result.current.total).toBe(1);
      expect(result.current.favoriteIssueIds).toEqual([7]);
    });

    it("resets the issues page via the callback after loading issues", async () => {
      const onIssuesPageReset = vi.fn();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
        if (url.includes("/api/issues?")) return jsonResponse({ items: [], total: 0, filters: {} });
        return jsonResponse({ state: null, activities: [], favorites: [] });
      });
      const { result } = renderData({ onIssuesPageReset });
      await waitFor(() => expect(result.current.user).not.toBeNull());
      await waitFor(() => expect(onIssuesPageReset).toHaveBeenCalled());
    });

    it("merges latestJob.error into syncState when lastError is missing", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
        if (url.includes("/api/sync/status")) {
          return jsonResponse({ state: { lastSyncStatus: "failed" }, latestJob: { error: "boom" } });
        }
        if (url.includes("/api/issues?")) return jsonResponse({ items: [], total: 0, filters: {} });
        return jsonResponse({ activities: [], favorites: [] });
      });
      const { result } = renderData();
      await waitFor(() => expect(result.current.user).not.toBeNull());
      await waitFor(() => expect(result.current.syncState?.lastError).toBe("boom"));
    });

    it("sets up a poll interval that calls refreshAll on the configured cadence", async () => {
      let issuesCalls = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
        if (url.includes("/api/issues?")) { issuesCalls += 1; return jsonResponse({ items: [], total: 0, filters: {} }); }
        return jsonResponse({ state: null, activities: [], favorites: [] });
      });
      const { result } = renderData();
      await waitFor(() => expect(result.current.user).not.toBeNull());
      await waitFor(() => expect(issuesCalls).toBeGreaterThanOrEqual(1));
      const callsBeforePoll = issuesCalls;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_000);
      });
      expect(issuesCalls).toBeGreaterThan(callsBeforePoll);
    });

    it("subscribes to the SSE stream with enabled=true once a user exists", async () => {
      await mountWithUser();
      const last = eventStreamCalls[eventStreamCalls.length - 1] as { enabled: boolean; handlers: Record<string, unknown> };
      expect(last.enabled).toBe(true);
      expect(Object.keys(last.handlers)).toEqual(expect.arrayContaining(["issue.created", "issue.updated"]));
    });

    it("coalesces a burst of SSE issue events into a single refreshAll call", async () => {
      let issuesCalls = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
        if (url.includes("/api/issues?")) { issuesCalls += 1; return jsonResponse({ items: [], total: 0, filters: {} }); }
        return jsonResponse({ state: null, activities: [], favorites: [] });
      });
      const { result } = renderData();
      await waitFor(() => expect(result.current.user).not.toBeNull());
      await waitFor(() => expect(issuesCalls).toBeGreaterThanOrEqual(1));
      const callsBeforeBurst = issuesCalls;

      const last = eventStreamCalls[eventStreamCalls.length - 1] as { handlers: Record<string, (data: unknown) => void> };
      // Sync upserts many issues in a row — each one fires its own SSE event.
      act(() => {
        for (let i = 0; i < 200; i += 1) {
          last.handlers["issue.updated"]?.({ redmineIssueId: i });
        }
      });

      // Still within the debounce window: no refresh yet.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(issuesCalls).toBe(callsBeforeBurst);

      // Debounce window elapses after the burst goes quiet: exactly one refresh.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(issuesCalls).toBe(callsBeforeBurst + 1);
    });
  });

  it("refreshAll toasts an error and clears loading when a loader throws", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/session/me")) return jsonResponse({ user: { id: "u1", username: "a", displayName: "A" } });
      if (url.includes("/api/issues?")) return jsonResponse({ error: "boom" }, false);
      return jsonResponse({ state: null, activities: [], favorites: [] });
    });
    const { result } = renderData();
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(result.current.loading).toBe(false);
  });
});
