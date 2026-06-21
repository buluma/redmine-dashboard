import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/src/lib/session';
import { prisma } from '@/src/lib/db';
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

  if (range === 'today' || range === 'yesterday') {
    try {
      const row = await prisma.wakaTimeDailySummary.findUnique({
        where: { userId_date: { userId, date: start } },
      });
      type Breakdown = { name: string; total_seconds: number; percent: number; text: string };
      const projects = (row?.projectsJson as Breakdown[]) ?? [];
      const languages = (row?.languagesJson as Breakdown[]) ?? [];
      const editors = (row?.editorsJson as Breakdown[]) ?? [];
      const categories = (row?.categoriesJson as Breakdown[]) ?? [];
      const totalSeconds = row?.totalSeconds ?? 0;
      const toBreakdown = (items: Breakdown[]) => items.map((b) => ({
        name: b.name, total_seconds: b.total_seconds, percent: b.percent,
        hours: Math.floor(b.total_seconds / 3600), minutes: Math.floor((b.total_seconds % 3600) / 60),
        digital: `${Math.floor(b.total_seconds / 3600)}:${String(Math.floor((b.total_seconds % 3600) / 60)).padStart(2, '0')}`,
        decimal: (b.total_seconds / 3600).toFixed(2), text: b.text,
      }));
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const payload: WakaTimeReportPayload = {
        range, generatedAt: new Date().toISOString(),
        stats: { data: {
          id: start, username: '', timeout: 15, writes_only: false, timezone: '',
          range: { start, end, date_index: 0 }, holidays: 0,
          total_seconds: totalSeconds, daily_average: totalSeconds,
          daily_average_including_other_language: totalSeconds,
          days_including_holidays: 1, days_minus_holidays: 1, edited_at: '',
          languages: toBreakdown(languages), projects: toBreakdown(projects),
          editors: toBreakdown(editors), operating_systems: [], categories: toBreakdown(categories), machines: [],
        } },
        summaries: { data: {
          start, end, range, timeout: 15, writes_only: false, holidays: 0,
          days_including_holidays: 1, days_minus_holidays: 1, total_seconds: totalSeconds,
          daily_average: totalSeconds,
          best_day: { id: start, total_seconds: totalSeconds, text: `${hrs} hrs ${mins} mins`, digital: `${hrs}:${String(mins).padStart(2, '0')}` },
          average_days_including_holidays: totalSeconds, days_without_logging: totalSeconds > 0 ? 0 : 1,
          human_readable_total: `${hrs} hrs ${mins} mins`,
          human_readable_daily_average: `${hrs} hrs ${mins} mins`,
          sum_of_daily_averages: totalSeconds,
          summaries: [{
            id: start, range: { start, end, date_index: 0 },
            grand_total: { total_seconds: totalSeconds, text: `${hrs} hrs ${mins} mins`, digital: `${hrs}:${String(mins).padStart(2, '0')}` },
            categories: toBreakdown(categories), projects: toBreakdown(projects),
            languages: toBreakdown(languages), editors: toBreakdown(editors), operating_systems: [],
          }],
        } },
        allTime: null, today: null, insights: { weekday: null }, goals: null,
        heartbeats: { start, end, days: [] },
      };
      return NextResponse.json(payload);
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load local stats' }, { status: 500 });
    }
  }

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
