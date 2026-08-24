import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WakaTimeApiError } from "@/src/lib/wakatime";

const { mockFindMany, mockUpsert, mockGetSummaries } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockGetSummaries: vi.fn(),
}));

vi.mock("@/src/lib/db", () => ({
  prisma: {
    wakaTimeDailySummary: {
      findMany: mockFindMany,
      upsert: mockUpsert,
    },
  },
}));

vi.mock("@/src/lib/wakatime", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/wakatime")>("@/src/lib/wakatime");
  return {
    ...actual,
    WakaTimeClient: vi.fn().mockImplementation(function (this: { getSummaries: typeof mockGetSummaries }) {
      this.getSummaries = mockGetSummaries;
    }),
  };
});

vi.mock("@/src/lib/telemetry", () => ({ trackInfo: vi.fn() }));

import { syncWakaTimeSummaries } from "@/src/lib/wakatime-sync";
import { asDateOnlyLocal, getSummaryDateWindow } from "@/src/lib/wakatime";

describe("syncWakaTimeSummaries date basis", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockGetSummaries.mockResolvedValue({ data: { summaries: [] } });
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("uses the same local-date basis as getSummaryDateWindow, not UTC, near a UTC day boundary", async () => {
    // UTC+14 (Kiritimati) so local date is a day ahead of UTC right around
    // UTC midnight — the exact window where a UTC-based formatDate and a
    // local-based one disagree.
    process.env.TZ = "Pacific/Kiritimati";
    const fixedNow = new Date("2026-06-20T23:30:00Z"); // UTC date is the 20th, local date is the 21st
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    expect(fixedNow.toISOString().split("T")[0]).toBe("2026-06-20"); // sanity: UTC basis would say the 20th
    expect(asDateOnlyLocal(fixedNow)).toBe("2026-06-21"); // local basis says the 21st

    await syncWakaTimeSummaries("user-1", "fake-key", { days: 1 });

    // The query sent to WakaTime, and the recent-date window used for the
    // no-overwrite guard, must both be on the local date — matching what
    // getSummaryDateWindow (used by the stats route) considers "today".
    const { end: expectedToday } = getSummaryDateWindow("today", fixedNow);
    expect(expectedToday).toBe("2026-06-21");
    expect(mockGetSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ start: "2026-06-21", end: "2026-06-21" })
    );
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: "2026-06-21", lte: "2026-06-21" },
        }),
      })
    );
  });
});

describe("syncWakaTimeSummaries 429 handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a rate-limited batch once instead of aborting the whole sync", async () => {
    mockGetSummaries
      .mockRejectedValueOnce(new WakaTimeApiError(429, "rate limited"))
      .mockResolvedValueOnce({
        data: {
          summaries: [
            {
              range: { start: "2026-06-20", end: "2026-06-20T00:00:00Z", date_index: 0 },
              grand_total: { total_seconds: 3600, text: "1h", digital: "1:00" },
              projects: [], languages: [], editors: [], categories: [],
            },
          ],
        },
      });
    mockUpsert.mockResolvedValue({});

    vi.useFakeTimers();
    const runPromise = syncWakaTimeSummaries("user-1", "fake-key", { days: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await runPromise;

    expect(mockGetSummaries).toHaveBeenCalledTimes(2);
    expect(result.synced).toBe(1);
  });

  it("skips just the rate-limited batch (doesn't throw) when the retry also 429s", async () => {
    mockGetSummaries.mockRejectedValue(new WakaTimeApiError(429, "rate limited"));

    vi.useFakeTimers();
    const runPromise = syncWakaTimeSummaries("user-1", "fake-key", { days: 1 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await runPromise;

    expect(result.synced).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
