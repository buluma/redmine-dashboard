import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/src/lib/telemetry", () => ({
  trackInfo: vi.fn(),
  trackFailure: vi.fn(),
}));

import { OdysseusCalendarApiError, OdysseusCalendarClient } from "@/src/lib/odysseus-calendar";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("OdysseusCalendarClient", () => {
  it("throws without a base URL", () => {
    expect(() => new OdysseusCalendarClient("", "token")).toThrow(/base URL/);
  });

  it("throws without a token", () => {
    expect(() => new OdysseusCalendarClient("http://odysseus.local", "")).toThrow(/token/);
  });

  it("sends a bearer token and returns events", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ uid: "e1", summary: "Standup", dtstart: "a", dtend: "b" }] }),
    });

    const client = new OdysseusCalendarClient("http://odysseus.local/", "tok123");
    const events = await client.listEvents("2026-09-01", "2026-09-02");

    expect(events).toEqual([{ uid: "e1", summary: "Standup", dtstart: "a", dtend: "b" }]);
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://odysseus.local/api/converge/calendar/events?start=2026-09-01&end=2026-09-02");
    expect(opts.headers.Authorization).toBe("Bearer tok123");
  });

  it("returns an empty array when the response has no events field", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const client = new OdysseusCalendarClient("http://odysseus.local", "tok");
    expect(await client.listEvents("a", "b")).toEqual([]);
  });

  it("throws OdysseusCalendarApiError on a non-ok response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "missing scope",
    });
    const client = new OdysseusCalendarClient("http://odysseus.local", "tok");
    await expect(client.listEvents("a", "b")).rejects.toThrow(OdysseusCalendarApiError);
  });

  it("wraps a network failure in OdysseusCalendarApiError", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    const client = new OdysseusCalendarClient("http://odysseus.local", "tok");
    await expect(client.listEvents("a", "b")).rejects.toThrow(OdysseusCalendarApiError);
  });
});
