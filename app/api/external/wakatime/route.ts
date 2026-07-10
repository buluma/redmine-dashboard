import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { syncWakaTimeSummaries, queryWakaTimeHistory } from "@/src/lib/wakatime-sync";
import { requireExternalApiKey } from "@/src/lib/external-auth";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const project = searchParams.get("project") ?? undefined;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const data = await queryWakaTimeHistory(user.id, { start, end, project });
    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    trackFailure({ event: "external.wakatime.query.failed", error, metricName: "external_wakatime_query_failed" });
    return NextResponse.json({ error: "Failed to query history" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  const apiKey = process.env.WAKATIME_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "WakaTime not configured" }, { status: 503 });
  }

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const days = typeof body.days === "number" ? Math.min(body.days, 3650) : 14;
    const result = await syncWakaTimeSummaries(user.id, apiKey, { days });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    trackFailure({ event: "external.wakatime.sync.failed", error, metricName: "external_wakatime_sync_failed" });
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
