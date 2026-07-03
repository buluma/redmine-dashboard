import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { correlateWakaTime } from "@/src/lib/correlation";
import { getSummaryDateWindow, isWakaTimeRange, DEFAULT_WAKATIME_RANGE } from "@/src/lib/wakatime";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawRange = url.searchParams.get("range");
  const range = isWakaTimeRange(rawRange) ? rawRange : DEFAULT_WAKATIME_RANGE;
  const { start, end } = getSummaryDateWindow(range);

  // Allow explicit start/end overrides
  const startParam = url.searchParams.get("start") ?? start;
  const endParam = url.searchParams.get("end") ?? end;

  try {
    const result = await correlateWakaTime(userId, {
      start: startParam,
      end: endParam,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
    });
    return NextResponse.json({ ...result, range, start: startParam, end: endParam });
  } catch (error) {
    trackFailure({ event: "correlation.query.failed", error, metricName: "correlation_query_failed" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to correlate" },
      { status: 500 },
    );
  }
}
