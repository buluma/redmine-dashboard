import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureException = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  metrics: { count: vi.fn(), distribution: vi.fn() },
}));

vi.mock("@/src/lib/log", () => ({
  logEvent: vi.fn(),
}));

describe("trackFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports error-level failures to Sentry as exceptions", async () => {
    const { trackFailure } = await import("@/src/lib/telemetry");
    const error = new Error("Redmine unreachable");

    trackFailure({ event: "sync.pull.failed", error, data: { userId: "u1" } });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: { telemetry_event: "sync.pull.failed" },
      extra: { userId: "u1" },
      fingerprint: undefined,
    });
  });

  it("groups non-Error failures by event name instead of the shared call stack", async () => {
    const { trackFailure } = await import("@/src/lib/telemetry");

    trackFailure({ event: "issue.bulk_update.failed", error: "bulk update failed for all issues" });

    expect(mockCaptureException).toHaveBeenCalledWith("bulk update failed for all issues", {
      tags: { telemetry_event: "issue.bulk_update.failed" },
      extra: {},
      fingerprint: ["issue.bulk_update.failed"],
    });
  });

  it("does not report warn-level failures such as rate limiting", async () => {
    const { trackFailure } = await import("@/src/lib/telemetry");

    trackFailure({ event: "sync.manual_pull.rate_limited", error: "manual pull rate-limited", level: "warn" });

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
