import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useBulkIssueActions } from "@/src/hooks/useBulkIssueActions";

const toastError = vi.fn();
const toastInfo = vi.fn();

vi.mock("@/src/components/ToastProvider", () => ({
  useToast: () => ({ error: toastError, info: toastInfo, success: vi.fn(), show: vi.fn(), clearAll: vi.fn() }),
}));

vi.mock("@/src/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(",")}` : key),
  }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function renderActions(overrides: Partial<Parameters<typeof useBulkIssueActions>[0]> = {}) {
  const params = {
    selectedIssueIds: [1, 2],
    bulkStatusId: 5,
    bulkPriorityId: 3,
    refreshAll: vi.fn(async () => {}),
    onClearSelection: vi.fn(),
    onBulkPriorityApplied: vi.fn(),
    ...overrides,
  };
  const { result } = renderHook(() => useBulkIssueActions(params));
  return { params, result };
}

describe("useBulkIssueActions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    toastError.mockClear();
    toastInfo.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("updateBulkStatus", () => {
    it("does nothing when there is no selection or no status chosen", async () => {
      const { params, result } = renderActions({ selectedIssueIds: [], bulkStatusId: 5 });
      await act(async () => { await result.current.updateBulkStatus(); });
      expect(fetch).not.toHaveBeenCalled();
      expect(params.refreshAll).not.toHaveBeenCalled();
    });

    it("posts issueIds+statusId, refreshes, and clears selection on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updatedCount: 2, failedCount: 0 }));
      const { params, result } = renderActions();

      await act(async () => { await result.current.updateBulkStatus(); });

      expect(fetch).toHaveBeenCalledWith("/api/issues/bulk-status", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ issueIds: [1, 2], statusId: 5 }),
      }));
      expect(toastInfo).toHaveBeenCalled();
      expect(params.refreshAll).toHaveBeenCalledTimes(1);
      expect(params.onClearSelection).toHaveBeenCalledTimes(1);
    });

    it("surfaces a partial-failure toast without throwing", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updatedCount: 1, failedCount: 1, failures: [] }));
      const { result } = renderActions();
      await act(async () => { await result.current.updateBulkStatus(); });
      expect(toastError).toHaveBeenCalled();
    });

    it("toasts an error and resets bulkUpdating when the request fails", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "nope" }, false));
      const { result } = renderActions();
      await act(async () => { await result.current.updateBulkStatus(); });
      expect(toastError).toHaveBeenCalledWith("nope");
      expect(result.current.bulkUpdating).toBe(false);
    });
  });

  describe("updateBulkPriority", () => {
    it("does nothing when no priority is chosen", async () => {
      const { result } = renderActions({ bulkPriorityId: 0 });
      await act(async () => { await result.current.updateBulkPriority(); });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("posts priorityId via bulk-update and resets the priority selector", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updatedCount: 2, failedCount: 0 }));
      const { params, result } = renderActions({ bulkPriorityId: 7 });

      await act(async () => { await result.current.updateBulkPriority(); });

      expect(fetch).toHaveBeenCalledWith("/api/issues/bulk-update", expect.objectContaining({
        body: JSON.stringify({ issueIds: [1, 2], priorityId: 7 }),
      }));
      expect(params.onBulkPriorityApplied).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateBulkMarkDone", () => {
    it("posts doneRatio 100 via bulk-update", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updatedCount: 2, failedCount: 0 }));
      const { result } = renderActions();
      await act(async () => { await result.current.updateBulkMarkDone(); });
      expect(fetch).toHaveBeenCalledWith("/api/issues/bulk-update", expect.objectContaining({
        body: JSON.stringify({ issueIds: [1, 2], doneRatio: 100 }),
      }));
    });
  });

  describe("handleBoardDrop", () => {
    it("posts a single-issue status change and refreshes on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updatedCount: 1, failedCount: 0 }));
      const { params, result } = renderActions();

      await act(async () => { await result.current.handleBoardDrop(99, 4); });

      expect(fetch).toHaveBeenCalledWith("/api/issues/bulk-status", expect.objectContaining({
        body: JSON.stringify({ issueIds: [99], statusId: 4 }),
      }));
      expect(toastInfo).toHaveBeenCalled();
      expect(params.refreshAll).toHaveBeenCalledTimes(1);
    });

    it("reverts via refreshAll when the drop is rejected", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ failures: [{ error: "not allowed" }] }));
      const { params, result } = renderActions();

      await act(async () => { await result.current.handleBoardDrop(99, 4); });

      expect(toastError).toHaveBeenCalledWith("not allowed");
      expect(params.refreshAll).toHaveBeenCalledTimes(1);
    });
  });

  it("sets bulkUpdating true while a bulk request is in flight", async () => {
    let resolveFetch: (v: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const { result } = renderActions();

    let pending: Promise<void>;
    act(() => {
      pending = result.current.updateBulkStatus();
    });
    await waitFor(() => expect(result.current.bulkUpdating).toBe(true));

    await act(async () => {
      resolveFetch!(jsonResponse({ updatedCount: 2, failedCount: 0 }));
      await pending;
    });
    expect(result.current.bulkUpdating).toBe(false);
  });
});
