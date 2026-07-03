import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { correlateWakaTime, applyTimeEntries } from "@/src/lib/correlation";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

function getApiKey(request: NextRequest): string | null {
  return request.headers.get("x-api-key") || request.nextUrl.searchParams.get("api_key");
}

function validateApiKey(key: string): boolean {
  const validKeys = (process.env.EXTERNAL_API_KEYS || "").split(",").filter(Boolean);
  return validKeys.includes(key);
}

function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = getApiKey(request);
  if (!apiKey || !validateApiKey(apiKey)) {
    return NextResponse.json({ error: "Valid API key required" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end params required" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const result = await correlateWakaTime(user.id, {
      start,
      end,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
    });
    return NextResponse.json({ ...result, start, end });
  } catch (error) {
    trackFailure({ event: "external.correlation.query.failed", error, metricName: "external_correlation_query_failed" });
    return NextResponse.json({ error: "Failed to correlate" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const start = typeof body.start === "string" ? body.start : null;
    const end = typeof body.end === "string" ? body.end : null;
    const dryRun = body.dryRun === true;

    if (!start || !end) {
      return NextResponse.json({ error: "start and end required" }, { status: 400 });
    }

    const result = await applyTimeEntries(user.id, {
      start,
      end,
      dryRun,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
    });
    return NextResponse.json(result);
  } catch (error) {
    trackFailure({ event: "external.correlation.apply.failed", error, metricName: "external_correlation_apply_failed" });
    const message = error instanceof Error ? error.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
