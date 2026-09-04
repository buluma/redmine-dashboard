/**
 * Odysseus calendar bridge client (SHA-172).
 *
 * Server-side only. Fetches meeting events from Odysseus's
 * /api/converge/calendar/events bridge route via a bearer token scoped to
 * calendar:read (converge_bridge token profile). Mirrors WakaTimeClient's
 * shape (src/lib/wakatime.ts) — thin fetch wrapper, typed error class.
 */

import { trackInfo, trackFailure } from "@/src/lib/telemetry";

export type OdysseusCalendarEvent = {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
};

export class OdysseusCalendarApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OdysseusCalendarApiError";
    this.status = status;
  }
}

// Same deadline WakaTimeClient uses (src/lib/wakatime.ts) for its raw
// http(s) requests. A hung fetch here would otherwise block pollTick
// indefinitely — tickInFlight only clears when pollTick returns.
const REQUEST_TIMEOUT_MS = 15000;

function isValidEvent(value: unknown): value is OdysseusCalendarEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.uid === "string" && e.uid.length > 0 &&
    typeof e.summary === "string" &&
    typeof e.dtstart === "string" &&
    typeof e.dtend === "string"
  );
}

export class OdysseusCalendarClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error("Odysseus base URL not configured. Set ODYSSEUS_BASE_URL in your environment.");
    }
    if (!token) {
      throw new Error("Odysseus API token not configured. Set ODYSSEUS_API_TOKEN in your environment.");
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async listEvents(start: string, end: string): Promise<OdysseusCalendarEvent[]> {
    const url = `${this.baseUrl}/api/converge/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    trackInfo("odysseus_calendar.fetch.started", { start, end });

    // One deadline covers both the request and reading/parsing the response
    // body — fetch's AbortSignal aborts an in-progress body read too, so a
    // slow trickle of bytes can't outlast the timeout either.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.token}` },
          signal: controller.signal,
        });
      } catch (error) {
        trackFailure({ event: "odysseus_calendar.fetch.network_error", error, data: { start, end } });
        throw new OdysseusCalendarApiError(0, `Failed to reach Odysseus calendar bridge: ${String(error)}`);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        trackFailure({
          event: "odysseus_calendar.fetch.failed",
          error: new Error(`status ${response.status}`),
          data: { start, end, status: response.status },
        });
        throw new OdysseusCalendarApiError(
          response.status,
          `Odysseus calendar API error (${response.status}): ${body.substring(0, 200)}`,
        );
      }

      const data = (await response.json()) as { events?: unknown };
      if (data.events !== undefined && !Array.isArray(data.events)) {
        throw new OdysseusCalendarApiError(502, "Odysseus calendar API returned a non-array events field");
      }
      const rawEvents = data.events ?? [];
      const events = rawEvents.filter(isValidEvent);
      if (events.length !== rawEvents.length) {
        trackFailure({
          event: "odysseus_calendar.fetch.invalid_events",
          error: new Error("one or more events failed shape validation"),
          data: { start, end, rawCount: rawEvents.length, validCount: events.length },
        });
      }

      trackInfo("odysseus_calendar.fetch.completed", { start, end, count: events.length });
      return events;
    } finally {
      clearTimeout(timer);
    }
  }
}
