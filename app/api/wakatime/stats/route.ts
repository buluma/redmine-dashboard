import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/src/lib/session';
import {
  DEFAULT_WAKATIME_RANGE,
  getSummaryDateWindow,
  isWakaTimeApiError,
  isWakaTimeRange,
  WakaTimeClient,
  type WakaTimeReportPayload,
} from '@/src/lib/wakatime';

export const runtime = 'nodejs';

function asDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastNDates(endDate: string, count: number): string[] {
  const out: string[] = [];
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return out;
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(asDateOnlyLocal(d));
  }
  return out;
}

async function fetchWeekdayInsight(client: WakaTimeClient, range: string) {
  const insightTypes: Array<'weekdays' | 'weekday' | 'days'> = ['weekdays', 'weekday', 'days'];
  for (const insightType of insightTypes) {
    try {
      return await client.getInsights(insightType, range, { quiet: true });
    } catch (err: unknown) {
      if (isWakaTimeApiError(err) && (err.status === 401 || err.status === 402 || err.status === 403)) {
        return null;
      }
      if (isWakaTimeApiError(err) && err.status !== 400) {
        return null;
      }
      // invalid type (400): try next insight type
    }
  }
  return null;
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.WAKATIME_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'WakaTime not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const rawRange = url.searchParams.get('range');
  const range = isWakaTimeRange(rawRange) ? rawRange : DEFAULT_WAKATIME_RANGE;
  const { start, end } = getSummaryDateWindow(range);

  try {
    const client = new WakaTimeClient(apiKey);
    const [stats, summaries, allTime, today] = await Promise.all([
      client.getStats(range),
      client.getSummaries({ start, end }),
      client.getAllTimeSinceToday(),
      client.getTodayStatusBar(),
    ]);
    const [weekdayInsight, goals] = await Promise.all([
      fetchWeekdayInsight(client, range),
      client.getGoals({ quiet: true }).catch(() => null),
    ]);
    const heartbeatDates = getLastNDates(end, 7);
    const heartbeatResults = await Promise.all(
      heartbeatDates.map(async (date) => ({
        date,
        data: await client.getHeartbeats(date, { quiet: true }).catch(() => null),
      })),
    );

    const payload: WakaTimeReportPayload = {
      range,
      generatedAt: new Date().toISOString(),
      stats,
      summaries,
      allTime,
      today,
      insights: {
        weekday: weekdayInsight,
      },
      goals,
      heartbeats: {
        start: heartbeatDates[0] ?? end,
        end: heartbeatDates[heartbeatDates.length - 1] ?? end,
        days: heartbeatResults,
      },
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch WakaTime report data';
    const lowered = message.toLowerCase();
    const status = lowered.includes('invalid') || lowered.includes('unauthorized')
      ? 401
      : lowered.includes('rate limit')
        ? 429
        : lowered.includes('calculating')
          ? 503
          : lowered.includes('network')
            ? 502
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
