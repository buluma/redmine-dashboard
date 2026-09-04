import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SyncQueueItem } from "@/lib/offline-db";

const { mockGetPendingSyncItems, mockClearSyncItems, mockIncrementSyncRetries } = vi.hoisted(() => ({
  mockGetPendingSyncItems: vi.fn(),
  mockClearSyncItems: vi.fn(),
  mockIncrementSyncRetries: vi.fn(),
}));

vi.mock("@/lib/offline-db", () => ({
  getPendingSyncItems: mockGetPendingSyncItems,
  clearSyncItems: mockClearSyncItems,
  incrementSyncRetries: mockIncrementSyncRetries,
}));

import { processSyncQueue } from "@/lib/sync-queue";

function item(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 1,
    type: "log_time",
    issueId: "issue-1",
    payload: { hours: 1.5, activityId: 31, comment: "test" },
    createdAt: new Date().toISOString(),
    retries: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("processSyncQueue log_time", () => {
  // Regression test: a prior version posted log_time items to
  // /api/time-entries, which only exports GET — every queued or
  // online-fallback time-log silently failed. The real route is
  // POST /api/issues/[id]/timelog.
  it("posts to /api/issues/[id]/timelog, not /api/time-entries", async () => {
    mockGetPendingSyncItems.mockResolvedValue([item()]);
    mockClearSyncItems.mockResolvedValue(undefined);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    const result = await processSyncQueue();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/issues/issue-1/timelog",
      expect.objectContaining({ method: "POST" }),
    );
    expect(global.fetch).not.toHaveBeenCalledWith("/api/time-entries", expect.anything());
    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(mockClearSyncItems).toHaveBeenCalledWith([1]);
  });

  it("retries a failed log_time item instead of dropping it before MAX_RETRIES", async () => {
    mockGetPendingSyncItems.mockResolvedValue([item({ retries: 1 })]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const result = await processSyncQueue();

    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockIncrementSyncRetries).toHaveBeenCalledWith(1);
    expect(mockClearSyncItems).not.toHaveBeenCalled();
  });
});
