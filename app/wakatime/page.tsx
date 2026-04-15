import Link from "next/link";
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
      // invalid type (400): continue to next possible insight type
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
    return (
      <main className="dashboard reports-v2">
        <header className="card hero">
          <div className="hero-top">
            <div>
              <p className="kicker">WakaTime</p>
              <h1>Coding Stats</h1>
              <p className="muted">Powered by WakaTime</p>
            </div>
            <div className="hero-actions">

            </div>
          </div>
        </header>
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>⚠️ WakaTime Not Configured</h2>
              <p className="muted">
                Set <code>WAKATIME_API_KEY</code> in your <code>.env</code> file
                to view your coding stats. Get your API key at{" "}
                <a href="https://wakatime.com/api-key" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #e63946)" }}>
                  wakatime.com/api-key
                </a>.
              </p>
            </div>
          </div>
        </section>
      </main>
    );
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

  return (
    <main className="dashboard reports-v2">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">WakaTime</p>
            <h1>Coding Stats</h1>
            <p className="muted">
              Powered by WakaTime · {allTime?.data.text ?? "—"} total coding time
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      {error ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>⚠️ Error Loading WakaTime Data</h2>
              <p className="muted" style={{ maxWidth: "600px" }}>
                {error.includes("401") || error.includes("invalid") || error.includes("Unauthorized")
                  ? (<>
                      Your WakaTime credential is invalid or expired.
                      {apiKey?.startsWith("waka_") ? (
                        <>
                          {" "}Your OAuth access token may have expired or is missing required scopes.
                          Regenerate it from your{" "}
                          <a href="https://wakatime.com/settings/applications" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #e63946)" }}>
                            OAuth Applications
                          </a>
                          {" "}page, or use your secret API key instead from{" "}
                          <a href="https://wakatime.com/api-key" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #e63946)" }}>
                            wakatime.com/api-key
                          </a>.
                        </>
                      ) : (
                        <>
                          {" "}Generate a new key at{" "}
                          <a href="https://wakatime.com/api-key" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #e63946)" }}>
                            wakatime.com/api-key
                          </a>
                          {" "}and update <code>WAKATIME_API_KEY</code> in your <code>.env</code> file.
                        </>
                      )}
                    </>)
                  : error.includes("rate limit")
                    ? "WakaTime rate limit exceeded. Please wait a few minutes and try again."
                    : error.includes("calculating")
                      ? "WakaTime is still processing your stats. Try again in a moment."
                      : `Failed to connect to WakaTime API: ${error}`}
              </p>
              {process.env.NODE_ENV === "development" && (
                <p className="muted" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
                  Debug: Key present: {!!apiKey} · Range: {DEFAULT_WAKATIME_RANGE} · Error: {error.substring(0, 100)}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : stats ? (
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
      ) : null}
    </main>
  );
}
