/**
 * Calendar-meeting timelog correlation (SHA-172).
 *
 * The calendar equivalent of applyTimeEntries (correlation.ts): where
 * applyTimeEntries matches WakaTime coding time to a ticket via its
 * GitHub-repo link, this matches an Odysseus calendar meeting to a
 * recurring-ticket series via a fuzzy match on the meeting's summary vs.
 * the series' name, then logs the meeting duration as a TimeEntry on that
 * series' currently-open instance.
 *
 * applyTimeEntries itself isn't reused directly — its signature recomputes
 * hours from WakaTimeDailySummary rows for a date range, which doesn't fit
 * a single meeting's (dtend - dtstart) duration. This mirrors its
 * TimeEntry-write transaction and dedup pattern instead (see
 * TimeEntry.calendarEventUid).
 */

import type { RecurringTicketSeries } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { trackInfo } from "@/src/lib/telemetry";
import type { OdysseusCalendarClient, OdysseusCalendarEvent } from "@/src/lib/odysseus-calendar";

// Below this score a meeting summary isn't considered a match for a
// recurring series' name. Naive token overlap (no external dependency):
// the ratio of tokens shared between the two over the smaller token set,
// so "Weekly DRC Support Sync" still matches series name "DRC Support"
// even though one is a superset of the other.
const MATCH_THRESHOLD = 0.6;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 0),
  );
}

// A single shared token ("standup", "sync") is too common across unrelated
// meetings and series names to trust on its own — require at least two
// shared tokens so a real match needs more than one coincidental word.
const MIN_SHARED_TOKENS = 2;

export function matchScore(summary: string, seriesName: string): number {
  const a = tokenize(summary);
  const b = tokenize(seriesName);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  if (shared < MIN_SHARED_TOKENS) return 0;
  return shared / Math.min(a.size, b.size);
}

/**
 * Picks the single best-scoring series for a meeting summary. Returns null
 * (no match) rather than guessing when two or more series tie for the top
 * score — logging a meeting against the wrong ticket on an arbitrary
 * tiebreak is worse than leaving it unmatched for a human to sort out.
 */
function findBestSeriesMatch(
  summary: string,
  seriesList: RecurringTicketSeries[],
): RecurringTicketSeries | null {
  let best: { series: RecurringTicketSeries; score: number } | null = null;
  let tied = false;
  for (const series of seriesList) {
    const score = matchScore(summary, series.name);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { series, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }
  return tied ? null : (best?.series ?? null);
}

export type CalendarTimelogResult = {
  eventCount: number;
  matched: number;
  logged: number;
  skipped: number;
  unmatched: number;
};

/**
 * Poll Odysseus for calendar events that ended within [start, end), fuzzy-
 * match each against the user's active recurring-ticket series, and log
 * the meeting duration as a TimeEntry on that series' currently-open
 * instance.
 *
 * Dedup: TimeEntry is unique on (issueId, calendarEventUid), so a re-poll
 * of the same (or an overlapping) window can't double-log the same
 * meeting — the repeat write hits the unique constraint and is treated as
 * "already logged", the same pattern applyTimeEntries uses for
 * (issueId, wakaTimeDate).
 */
export async function syncCalendarMeetings(
  userId: string,
  client: OdysseusCalendarClient,
  window: { start: string; end: string },
): Promise<CalendarTimelogResult> {
  const events = await client.listEvents(window.start, window.end);
  const result: CalendarTimelogResult = { eventCount: events.length, matched: 0, logged: 0, skipped: 0, unmatched: 0 };
  if (events.length === 0) return result;

  const seriesList = await prisma.recurringTicketSeries.findMany({
    where: { userId, isActive: true },
  });
  if (seriesList.length === 0) {
    result.unmatched = events.length;
    return result;
  }

  for (const event of events) {
    await applyCalendarEvent(userId, event, seriesList, result);
  }

  trackInfo("calendar_timelog.sync.completed", { userId, ...result });
  return result;
}

async function applyCalendarEvent(
  userId: string,
  event: OdysseusCalendarEvent,
  seriesList: RecurringTicketSeries[],
  result: CalendarTimelogResult,
): Promise<void> {
  const dtstart = new Date(event.dtstart);
  const dtend = new Date(event.dtend);
  if (!(dtend.getTime() > dtstart.getTime())) {
    // Malformed or zero-length event — nothing to log.
    result.skipped++;
    return;
  }

  const series = findBestSeriesMatch(event.summary, seriesList);
  if (!series) {
    result.unmatched++;
    return;
  }
  result.matched++;

  const instance = await prisma.recurringTicketInstance.findFirst({
    where: { seriesId: series.id, userId, status: "open" },
    orderBy: { scheduledCreateDate: "desc" },
  });
  if (!instance || !instance.issueId) {
    result.skipped++;
    return;
  }

  const hours = Math.round(((dtend.getTime() - dtstart.getTime()) / 3600000) * 100) / 100;
  if (hours <= 0) {
    result.skipped++;
    return;
  }

  try {
    await prisma.$transaction([
      prisma.timeEntry.create({
        data: {
          issueId: instance.issueId,
          userId,
          hours,
          spentOn: dtstart,
          activityId: 31,
          activityName: "Development",
          comments: `Meeting: ${event.summary}`,
          source: "calendar",
          calendarEventUid: event.uid,
        },
      }),
      prisma.issue.update({
        where: { id: instance.issueId },
        data: {
          lastActivityAt: new Date(),
          lastActivityType: "calendar_meeting_logged",
          spentHours: { increment: hours },
        },
      }),
    ]);
    result.logged++;
  } catch (error) {
    // Concurrent poll runs (or a re-poll of an overlapping window) can beat
    // us to the same issueId+calendarEventUid — a P2002 here means "already
    // logged", not an error.
    if ((error as { code?: string }).code === "P2002") {
      result.skipped++;
      return;
    }
    throw error;
  }
}
