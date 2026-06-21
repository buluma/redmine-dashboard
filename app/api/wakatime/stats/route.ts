import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/src/lib/session';
import { prisma } from '@/src/lib/db';
import { buildGoalsFromDb, buildTodayFromDb } from '@/src/lib/wakatime-sync';
import {
  DEFAULT_WAKATIME_RANGE,
  getSummaryDateWindow,
  isWakaTimeRange,
  type WakaTimeReportPayload,
} from '@/src/lib/wakatime';

export const runtime = 'nodejs';

type Breakdown = { name: string; total_seconds: number; percent: number; text: string };

function toBreakdown(items: Breakdown[]) {
  return items.map((b) => ({
    name: b.name, total_seconds: b.total_seconds, percent: b.percent,
    hours: Math.floor(b.total_seconds / 3600),
    minutes: Math.floor((b.total_seconds % 3600) / 60),
    digital: `${Math.floor(b.total_seconds / 3600)}:${String(Math.floor((b.total_seconds % 3600) / 60)).padStart(2, '0')}`,
    decimal: (b.total_seconds / 3600).toFixed(2),
    text: b.text,
  }));
}

function mergeBreakdowns(rows: Array<{ json: Breakdown[] | null }>): Breakdown[] {
  const map = new Map<string, { total_seconds: number; text: string }>();
  for (const row of rows) {
    for (const b of row.json ?? []) {
      const existing = map.get(b.name);
      if (existing) {
        existing.total_seconds += b.total_seconds;
      } else {
        map.set(b.name, { total_seconds: b.total_seconds, text: b.text });
      }
    }
  }
  const total = Array.from(map.values()).reduce((s, v) => s + v.total_seconds, 0) || 1;
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      total_seconds: v.total_seconds,
      percent: Math.round((v.total_seconds / total) * 10000) / 100,
      text: `${Math.floor(v.total_seconds / 3600)} hrs ${Math.floor((v.total_seconds % 3600) / 60)} mins`,
    }))
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs} hrs ${mins} mins`;
}

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawRange = url.searchParams.get('range');
  const range = isWakaTimeRange(rawRange) ? rawRange : DEFAULT_WAKATIME_RANGE;
  const { start, end, days: rangeDays } = getSummaryDateWindow(range);

  try {
    const rows = await prisma.wakaTimeDailySummary.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const totalSeconds = rows.reduce((s, r) => s + r.totalSeconds, 0);
    const activeDays = rows.filter((r) => r.totalSeconds > 0).length;
    const dailyAvg = activeDays > 0 ? totalSeconds / rangeDays : 0;

    const projects = mergeBreakdowns(rows.map((r) => ({ json: r.projectsJson as Breakdown[] | null })));
    const languages = mergeBreakdowns(rows.map((r) => ({ json: r.languagesJson as Breakdown[] | null })));
    const editors = mergeBreakdowns(rows.map((r) => ({ json: r.editorsJson as Breakdown[] | null })));
    const categories = mergeBreakdowns(rows.map((r) => ({ json: r.categoriesJson as Breakdown[] | null })));

    const bestRow = rows.reduce<typeof rows[0] | null>((best, r) => (!best || r.totalSeconds > best.totalSeconds) ? r : best, null);

    const summaryDays = rows.map((r) => ({
      id: r.date,
      range: { start: r.date, end: r.date, date_index: 0 },
      grand_total: { total_seconds: r.totalSeconds, text: formatDuration(r.totalSeconds), digital: `${Math.floor(r.totalSeconds / 3600)}:${String(Math.floor((r.totalSeconds % 3600) / 60)).padStart(2, '0')}` },
      categories: toBreakdown((r.categoriesJson as Breakdown[]) ?? []),
      projects: toBreakdown((r.projectsJson as Breakdown[]) ?? []),
      languages: toBreakdown((r.languagesJson as Breakdown[]) ?? []),
      editors: toBreakdown((r.editorsJson as Breakdown[]) ?? []),
      operating_systems: [],
    }));

    const payload: WakaTimeReportPayload = {
      range,
      generatedAt: new Date().toISOString(),
      stats: { data: {
        id: range, username: '', timeout: 15, writes_only: false, timezone: '',
        range: { start, end, date_index: 0 }, holidays: 0,
        total_seconds: totalSeconds, daily_average: dailyAvg,
        daily_average_including_other_language: dailyAvg,
        days_including_holidays: rangeDays, days_minus_holidays: rangeDays, edited_at: '',
        languages: toBreakdown(languages), projects: toBreakdown(projects),
        editors: toBreakdown(editors), operating_systems: [], categories: toBreakdown(categories), machines: [],
      } },
      summaries: { data: {
        start, end, range, timeout: 15, writes_only: false, holidays: 0,
        days_including_holidays: rangeDays, days_minus_holidays: rangeDays,
        total_seconds: totalSeconds, daily_average: dailyAvg,
        best_day: bestRow
          ? { id: bestRow.date, total_seconds: bestRow.totalSeconds, text: formatDuration(bestRow.totalSeconds), digital: `${Math.floor(bestRow.totalSeconds / 3600)}:${String(Math.floor((bestRow.totalSeconds % 3600) / 60)).padStart(2, '0')}` }
          : { id: start, total_seconds: 0, text: '0 hrs 0 mins', digital: '0:00' },
        average_days_including_holidays: dailyAvg,
        days_without_logging: rangeDays - activeDays,
        human_readable_total: formatDuration(totalSeconds),
        human_readable_daily_average: formatDuration(dailyAvg),
        sum_of_daily_averages: dailyAvg,
        summaries: summaryDays,
      } },
      allTime: null,
      today: (() => {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const todayRow = rows.find((r) => r.date === todayStr);
        return buildTodayFromDb(todayRow?.totalSeconds ?? 0, todayStr);
      })(),
      insights: { weekday: null },
      goals: buildGoalsFromDb(rows.map((r) => ({ date: r.date, totalSeconds: r.totalSeconds }))),
      heartbeats: { start, end, days: [] },
    };

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load stats from local DB';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
