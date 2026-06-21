import { prisma } from "@/src/lib/db";
import { WakaTimeClient, type WakaTimeBreakdown } from "@/src/lib/wakatime";
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

  const existing = await prisma.wakaTimeDailySummary.findMany({
    where: {
      userId,
      date: { gte: formatDate(start), lte: formatDate(end) },
    },
    select: { date: true },
  });
  const existingDates = new Set(existing.map((r) => r.date));

  const resp = await client.getSummaries({
    start: formatDate(start),
    end: formatDate(end),
  });

  let synced = 0;
  let skipped = 0;

  for (const day of resp.data.summaries) {
    const date = day.range.start.split("T")[0];
    if (existingDates.has(date)) {
      skipped++;
      continue;
    }
    if (day.grand_total.total_seconds === 0) {
      skipped++;
      continue;
    }

    await prisma.wakaTimeDailySummary.create({
      data: {
        userId,
        date,
        totalSeconds: day.grand_total.total_seconds,
        projectsJson: toBreakdownJson(day.projects),
        languagesJson: toBreakdownJson(day.languages),
        editorsJson: toBreakdownJson(day.editors),
        categoriesJson: toBreakdownJson(day.categories),
      },
    });
    synced++;
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
