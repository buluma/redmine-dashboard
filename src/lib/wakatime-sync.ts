import { prisma } from "@/src/lib/db";
import { WakaTimeClient, type WakaTimeBreakdown, type WakaTimeSummaryDay, type WakaTimeGoalsResponse, type WakaTimeTodayResponse } from "@/src/lib/wakatime";
import { trackInfo, trackFailure } from "@/src/lib/telemetry";

function toBreakdownJson(items: WakaTimeBreakdown[]) {
  return items.map((b) => ({
    name: b.name,
    total_seconds: b.total_seconds,
    percent: b.percent,
    text: b.text,
  }));
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function syncWakaTimeSummaries(
  userId: string,
  apiKey: string,
  options?: { days?: number }
): Promise<{ synced: number; skipped: number }> {
  const days = options?.days ?? 14;
  const client = new WakaTimeClient(apiKey);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);

  const today = formatDate(end);
  const yesterdayDate = new Date(end);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = formatDate(yesterdayDate);
  const recentDates = new Set([today, yesterday]);

  const existing = await prisma.wakaTimeDailySummary.findMany({
    where: {
      userId,
      date: { gte: formatDate(start), lte: formatDate(end) },
    },
    select: { date: true },
  });
  const existingDates = new Set(existing.map((r) => r.date));

  let synced = 0;
  let skipped = 0;
  const BATCH_DAYS = 28;

  for (let batchStart = new Date(start); batchStart <= end; ) {
    const batchEnd = new Date(batchStart);
    batchEnd.setDate(batchEnd.getDate() + BATCH_DAYS - 1);
    if (batchEnd > end) batchEnd.setTime(end.getTime());

    const resp = await client.getSummaries({
      start: formatDate(batchStart),
      end: formatDate(batchEnd),
    });

    const raw = resp.data as unknown;
    const summaries = Array.isArray(raw) ? raw as WakaTimeSummaryDay[] : (raw as { summaries?: WakaTimeSummaryDay[] }).summaries ?? [];
    for (const day of summaries) {
      const date = day.range.end.split("T")[0];
      const isRecent = recentDates.has(date);
      if (!isRecent && existingDates.has(date)) {
        skipped++;
        continue;
      }
      if (day.grand_total.total_seconds === 0 && !existingDates.has(date)) {
        skipped++;
        continue;
      }

      const data = {
        userId,
        date,
        totalSeconds: day.grand_total.total_seconds,
        projectsJson: toBreakdownJson(day.projects),
        languagesJson: toBreakdownJson(day.languages),
        editorsJson: toBreakdownJson(day.editors),
        categoriesJson: toBreakdownJson(day.categories),
      };

      await prisma.wakaTimeDailySummary.upsert({
        where: { userId_date: { userId, date } },
        update: data,
        create: data,
      });
      synced++;
    }

    batchStart.setDate(batchStart.getDate() + BATCH_DAYS);
  }

  trackInfo("wakatime.sync.completed", { userId, synced, skipped, days });
  return { synced, skipped };
}

export async function queryWakaTimeHistory(
  userId: string,
  options?: { start?: string; end?: string; project?: string }
) {
  const where: Record<string, unknown> = { userId };
  if (options?.start) where.date = { ...((where.date as Record<string, string>) ?? {}), gte: options.start };
  if (options?.end) where.date = { ...((where.date as Record<string, string>) ?? {}), lte: options.end };

  const rows = await prisma.wakaTimeDailySummary.findMany({
    where,
    orderBy: { date: "asc" },
  });

  if (options?.project) {
    const name = options.project.toLowerCase();
    return rows
      .map((row) => {
        const projects = (row.projectsJson as Array<{ name: string; total_seconds: number }>) ?? [];
        const match = projects.find((p) => p.name.toLowerCase().includes(name));
        if (!match) return null;
        return { date: row.date, totalSeconds: match.total_seconds, project: match.name };
      })
      .filter(Boolean);
  }

  return rows.map((row) => ({
    date: row.date,
    totalSeconds: row.totalSeconds,
    projects: row.projectsJson,
    languages: row.languagesJson,
    editors: row.editorsJson,
  }));
}

const DAILY_GOAL_SECONDS = 5 * 3600;

export function buildGoalsFromDb(
  rows: Array<{ date: string; totalSeconds: number }>
): WakaTimeGoalsResponse {
  const chartData = rows.map((r) => {
    const status = r.totalSeconds >= DAILY_GOAL_SECONDS ? "success" : "fail";
    const hrs = Math.floor(r.totalSeconds / 3600);
    const mins = Math.floor((r.totalSeconds % 3600) / 60);
    const goalHrs = Math.floor(DAILY_GOAL_SECONDS / 3600);
    return {
      actual_seconds: r.totalSeconds,
      actual_seconds_text: `${hrs} hrs ${mins} mins`,
      goal_seconds: DAILY_GOAL_SECONDS,
      goal_seconds_text: `${goalHrs} hrs`,
      range_status: status as "success" | "fail",
      range_status_reason: status === "success" ? "Goal met" : `${goalHrs}h goal not reached`,
      range: { date: r.date },
    };
  });

  const successDays = chartData.filter((d) => d.range_status === "success").length;
  const successRate = chartData.length > 0 ? successDays / chartData.length : 0;
  const overallStatus = successRate >= 0.8 ? "success" : successDays > 0 ? "fail" : "pending";

  return {
    data: [{
      id: "local-daily-coding-goal",
      title: `Code 5 hrs per day (${successDays}/${chartData.length} days)`,
      custom_title: `Code 5 hrs per day (${successDays}/${chartData.length} days)`,
      type: "coding",
      delta: "day",
      status: overallStatus,
      status_percent_calculated: Math.round(successRate * 100),
      is_enabled: true,
      chart_data: chartData,
    }],
  };
}

export function buildTodayFromDb(todaySeconds: number, date: string): WakaTimeTodayResponse {
  const hrs = Math.floor(todaySeconds / 3600);
  const mins = Math.floor((todaySeconds % 3600) / 60);
  return {
    data: {
      id: date,
      kind: "day",
      user_id: "",
      range: { date, start: date, end: date },
      total_seconds: todaySeconds,
      text: `${hrs} hrs ${mins} mins`,
      digital: `${hrs}:${String(mins).padStart(2, "0")}`,
      decimal: (todaySeconds / 3600).toFixed(2),
    },
  };
}
