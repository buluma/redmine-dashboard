import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { correlateWakaTime } from "@/src/lib/correlation";
import { getSummaryDateWindow, DEFAULT_WAKATIME_RANGE } from "@/src/lib/wakatime";
import { CorrelationClient } from "./correlation-client";

export const runtime = "nodejs";

export default async function CorrelationPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const range = DEFAULT_WAKATIME_RANGE;
  const { start, end } = getSummaryDateWindow(range);

  const data = await correlateWakaTime(userId, { start, end });

  return (
    <main className="dashboard reports-v2">
      <header className="page-header">
        <h1>⚡ Time Correlation</h1>
        <p className="muted">
          Match WakaTime coding hours to personal tickets via GitHub repo links.
        </p>
      </header>
      <CorrelationClient
        initialData={data}
        initialRange={range}
        initialStart={start}
        initialEnd={end}
      />
    </main>
  );
}
