import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { prisma } from "@/src/lib/db";
import {
  DEFAULT_WAKATIME_RANGE,
  getSummaryDateWindow,
  isWakaTimeApiError,
  WakaTimeClient,
} from "@/src/lib/wakatime";
import { WakatimeChartsClient } from "./wakatime-client";
import { WakatimeErrorView } from "./error-view";
import { WakatimeHeader } from "./wakatime-header";

export const runtime = "nodejs";

function asDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchWeekdayInsight(client: WakaTimeClient, range: string) {
  const insightTypes: Array<"weekdays" | "weekday" | "days"> = ["weekdays", "weekday", "days"];
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
    }
  }
  return null;
}

export default async function WakatimePage() {
  // Graceful auth: redirect to login if no session
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/");
  }

  const apiKey = process.env.WAKATIME_API_KEY;
  if (!apiKey) {
    return <WakatimeErrorView apiKey={undefined} error={null} />;
  }

  // Fetch data in parallel
  let stats: Awaited<ReturnType<WakaTimeClient["getStats"]>> | null = null;
  let summaries: Awaited<ReturnType<WakaTimeClient["getSummaries"]>> | null = null;
  let allTime: Awaited<ReturnType<WakaTimeClient["getAllTimeSinceToday"]>> | null = null;
  let today: Awaited<ReturnType<WakaTimeClient["getTodayStatusBar"]>> | null = null;
  let weekdayInsight: Awaited<ReturnType<WakaTimeClient["getInsights"]>> | null = null;
  let goals: Awaited<ReturnType<WakaTimeClient["getGoals"]>> | null = null;
  let heartbeatDays: Array<{ date: string; data: Awaited<ReturnType<WakaTimeClient["getHeartbeats"]>> | null }> = [];
  let error: string | null = null;

  try {
    const client = new WakaTimeClient(apiKey);
    const { start, end } = getSummaryDateWindow(DEFAULT_WAKATIME_RANGE);
    [stats, summaries, allTime, today] = await Promise.all([
      client.getStats(DEFAULT_WAKATIME_RANGE),
      client.getSummaries({ start, end }),
      client.getAllTimeSinceToday(),
      client.getTodayStatusBar(),
    ]);
    [weekdayInsight, goals] = await Promise.all([
      fetchWeekdayInsight(client, DEFAULT_WAKATIME_RANGE),
      client.getGoals({ quiet: true }).catch(() => null),
    ]);
    const heartbeatDates: string[] = [];
    const cursor = new Date(`${end}T00:00:00`);
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() - i);
      heartbeatDates.push(asDateOnlyLocal(d));
    }
    heartbeatDays = await Promise.all(
      heartbeatDates.map(async (date) => ({
        date,
        data: await client.getHeartbeats(date, { quiet: true }).catch(() => null),
      })),
    );
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to fetch WakaTime data";
  }

  if (error) {
    return <WakatimeErrorView apiKey={apiKey} error={error} allTimeText={allTime?.data.text} />;
  }

  if (!stats) return null;

  return (
    <main className="dashboard reports-v2">
      <WakatimeHeader allTimeText={allTime?.data.text} />
      <WakatimeChartsClient
        stats={stats}
        summaries={summaries}
        allTime={allTime}
        today={today}
        weekdayInsight={weekdayInsight}
        goals={goals}
        heartbeatDays={heartbeatDays}
        initialRange={DEFAULT_WAKATIME_RANGE}
      />
    </main>
  );
}
