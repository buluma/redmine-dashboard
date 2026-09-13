import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { correlateWakaTime, applyTimeEntries, getAutoCreateOptionsFromEnv } from "@/src/lib/correlation";
import { requireExternalApiKey } from "@/src/lib/external-auth";
import { requireRedmineClientForUser } from "@/src/lib/auth";
import { trackFailure } from "@/src/lib/telemetry";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authError = requireExternalApiKey(request);
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
  const authError = requireExternalApiKey(request);
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

    // Needed to push an hours correction to an already-pushed WakaTime entry
    // (see applyTimeEntries) — optional because a user without Redmine
    // connected can still use the local-only create path. Only the expected
    // "not connected" case is treated as optional; anything else (a broken
    // credential decrypt, a DB blip) is tracked so it doesn't look identical
    // to a user who simply hasn't connected Redmine.
    let client;
    try {
      client = (await requireRedmineClientForUser(user.id)).client;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Redmine account not connected") {
        trackFailure({
          event: "external.correlation.redmine_client_lookup_failed",
          error,
          metricName: "external_correlation_redmine_client_lookup_failed",
        });
      }
      client = undefined;
    }

    const result = await applyTimeEntries(user.id, {
      start,
      end,
      dryRun,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
      autoCreate: getAutoCreateOptionsFromEnv(),
      client,
    });
    return NextResponse.json(result);
  } catch (error) {
    trackFailure({ event: "external.correlation.apply.failed", error, metricName: "external_correlation_apply_failed" });
    const message = error instanceof Error ? error.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
