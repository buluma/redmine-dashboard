import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { prisma } from "@/src/lib/db";
import { WakaTimeClient } from "@/src/lib/wakatime";
import { WakatimeChartsClient } from "./wakatime-client";

export const runtime = "nodejs";

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
  if (!apiKey || apiKey.startsWith("wakatime_")) {
    return (
      <main className="dashboard">
        <header className="card hero">
          <div className="hero-top">
            <div>
              <h1>Coding Stats</h1>
              <p className="muted">Powered by WakaTime</p>
            </div>
            <div className="hero-actions">
              <Link href="/" className="primary-link">Back to Dashboard</Link>
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
  let error: string | null = null;

  try {
    const client = new WakaTimeClient(apiKey);
    [stats, summaries, allTime, today] = await Promise.all([
      client.getStats(),
      client.getSummaries({ range: "Last 7 Days" }),
      client.getAllTimeSinceToday(),
      client.getTodayStatusBar(),
    ]);
  } catch (err: any) {
    error = err.message || "Failed to fetch WakaTime data";
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
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
              <h2>⚠️ Error Loading Data</h2>
              <p className="muted">{error}</p>
            </div>
          </div>
        </section>
      ) : stats ? (
        <WakatimeChartsClient
          stats={stats}
          summaries={summaries}
          allTime={allTime}
          today={today}
        />
      ) : null}
    </main>
  );
}
