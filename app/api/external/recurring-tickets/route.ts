import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { requireExternalApiKey } from "@/src/lib/external-auth";
import { requireRedmineClientForUser } from "@/src/lib/auth";
import { acquireLeaderLock } from "@/src/lib/leader-lock";
import { trackFailure } from "@/src/lib/telemetry";
import {
  computePeriodKey,
  computeScheduledWindow,
  getDueSeriesForCreate,
  getInstancesDueForClose,
  runRecurringTicketsTick,
} from "@/src/lib/recurring-tickets";

export const runtime = "nodejs";

const LOCK_NAME = "recurring-tickets";

// GET: dry preview — what the next POST would create/close, computed purely
// from local data. Never calls Redmine, never writes.
export async function GET(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const today = new Date();
    const dueSeries = await getDueSeriesForCreate(user.id, today);
    const dueClose = await getInstancesDueForClose(user.id, today);

    return NextResponse.json({
      today: today.toISOString(),
      dueToCreate: dueSeries.map((series) => {
        const periodKey = computePeriodKey(series, today);
        const window = computeScheduledWindow(series, periodKey);
        return {
          seriesKey: series.key,
          seriesName: series.name,
          periodKey,
          scheduledCreateDate: window.createDate.toISOString(),
          scheduledCloseDate: window.closeDate.toISOString(),
        };
      }),
      dueToClose: dueClose.map((instance) => ({
        instanceId: instance.id,
        seriesId: instance.seriesId,
        periodKey: instance.periodKey,
        subject: instance.subject,
        scheduledCloseDate: instance.scheduledCloseDate.toISOString(),
        status: instance.status,
        closeAttempts: instance.closeAttempts,
      })),
    });
  } catch (error) {
    trackFailure({
      event: "external.recurring_tickets.preview.failed",
      error,
      metricName: "external_recurring_tickets_preview_failed",
    });
    return NextResponse.json({ error: "Failed to preview recurring tickets" }, { status: 500 });
  }
}

// POST: execute a tick — creates any due tickets, closes any due instances.
// A consequential Redmine mutation, so it's gated by a leader lock rather
// than the in-process poller (see design doc SHA-44).
export async function POST(request: NextRequest) {
  const authError = requireExternalApiKey(request);
  if (authError) return authError;

  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No users" }, { status: 503 });

    const ownerId = randomUUID();
    const isLeader = await acquireLeaderLock(LOCK_NAME, ownerId, env.recurringTicketsLockTtlMs);
    if (!isLeader) {
      return NextResponse.json({ locked: true, message: "Another recurring-tickets tick is already running" }, { status: 200 });
    }

    const { client } = await requireRedmineClientForUser(user.id);
    const result = await runRecurringTicketsTick(user.id, client);

    return NextResponse.json({ locked: false, ...result });
  } catch (error) {
    trackFailure({
      event: "external.recurring_tickets.tick.failed",
      error,
      metricName: "external_recurring_tickets_tick_failed",
    });
    const message = error instanceof Error ? error.message : "Tick failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
