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
  if (!apiKey) {
    return (
      <main className="dashboard">
        <header className="card hero">
          <div className="hero-top">
            <div>
              <p className="kicker">WakaTime</p>
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
                  Debug: Key present: {!!apiKey} · Type: {apiKey?.startsWith("waka_") ? "OAuth token" : "API key"} · Prefix: {apiKey ? apiKey.slice(0, 10) + "…" : "none"}
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
        />
      ) : null}
    </main>
  );
}
