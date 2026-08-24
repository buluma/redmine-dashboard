import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { syncWakaTimeSummaries, queryWakaTimeHistory } from "@/src/lib/wakatime-sync";
import { isRateLimited } from "@/src/lib/rate-limit";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const project = searchParams.get("project") ?? undefined;

  try {
    const data = await queryWakaTimeHistory(userId, { start, end, project });
    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    trackFailure({ event: "wakatime.history.query.failed", error, metricName: "wakatime_history_query_failed" });
    return NextResponse.json({ error: "Failed to query history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.WAKATIME_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WakaTime not configured" }, { status: 503 });
  }

  // WAKATIME_API_KEY is shared app-wide — an unthrottled "sync" button can
  // burn through WakaTime's own rate limit and lock the key for everyone,
  // including the poller's background syncs.
  const rl = isRateLimited({ key: `wakatime-history-sync:${userId}`, max: 5, windowMs: 60_000 });
  if (rl.limited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const days = typeof body.days === "number" ? Math.min(body.days, 365) : 14;
    const result = await syncWakaTimeSummaries(userId, apiKey, { days });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    trackFailure({ event: "wakatime.history.sync.failed", error, metricName: "wakatime_history_sync_failed" });
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
