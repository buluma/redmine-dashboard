import { NextResponse } from "next/server";
import { getAuthenticatedUserId, requireRedmineClientForUser } from "@/src/lib/auth";
import { applyTimeEntries, getAutoCreateOptionsFromEnv } from "@/src/lib/correlation";
import { isRateLimited } from "@/src/lib/rate-limit";
import { trackFailure } from "@/src/lib/telemetry";
import { z } from "zod";

export const runtime = "nodejs";

const applySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = isRateLimited({ key: `correlation-apply:${userId}`, max: 10, windowMs: 60_000 });
  if (rl.limited) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }

    // Needed to push an hours correction to an already-pushed WakaTime entry
    // (see applyTimeEntries) — optional because a user without Redmine
    // connected can still use the local-only create path. Only the expected
    // "not connected" case is treated as optional; anything else (a broken
    // credential decrypt, a DB blip) is tracked so it doesn't look identical
    // to a user who simply hasn't connected Redmine.
    let client;
    try {
      client = (await requireRedmineClientForUser(userId)).client;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Redmine account not connected") {
        trackFailure({
          event: "correlation.apply.redmine_client_lookup_failed",
          error,
          metricName: "correlation_apply_redmine_client_lookup_failed",
        });
      }
      client = undefined;
    }

    const result = await applyTimeEntries(userId, {
      ...parsed.data,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
      autoCreate: getAutoCreateOptionsFromEnv(),
      client,
    });
    return NextResponse.json(result);
  } catch (error) {
    trackFailure({ event: "correlation.apply.failed", error, metricName: "correlation_apply_failed" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply" },
      { status: 500 },
    );
  }
}
