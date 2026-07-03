import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { applyTimeEntries } from "@/src/lib/correlation";
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

    const result = await applyTimeEntries(userId, {
      ...parsed.data,
      catchAllIssueId: process.env.MISC_UNLINKED_ISSUE_ID,
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
