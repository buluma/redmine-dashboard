import type { RecurringTicketSeries, RecurringTicketInstance } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { logEvent } from "@/src/lib/log";
import { RedmineClient } from "@/src/lib/redmine";
import { applyTimeEntries } from "@/src/lib/correlation";
import { recordIssueActivityEvent, recomputeIssueActivityIndex } from "@/src/lib/activity-index";

const NAIROBI_TZ = "Africa/Nairobi";
const REDMINE_STATUS_CLOSED = 5;
const REDMINE_STATUS_RESOLVED = 3;
// API key owner (MBU) — the implicit author on ticket creation and the only
// user Redmine allows to Close a ticket it authored. A future credential
// rotation onto a different account would silently break the close step.
const REDMINE_EXPECTED_AUTHOR_ID = 194;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function nairobiDateParts(instant: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NAIROBI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday],
  };
}

// Nairobi is a fixed UTC+3 with no DST, and every scheduling decision here
// only needs calendar-day granularity — so a "Nairobi day" is represented as
// UTC midnight of that calendar date, not the true UTC instant of Nairobi
// midnight. Keeping every date in this module on that same convention is
// what makes the day-level comparisons in getDueSeriesForCreate /
// getInstancesDueForClose correct.
function nairobiDayMarker(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function nairobiCalendarDateAsUtc(instant: Date): Date {
  const { year, month, day } = nairobiDateParts(instant);
  return nairobiDayMarker(year, month, day);
}

export function computeIsoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek };
}

function isoWeekMonday(isoYear: number, isoWeek: number): { year: number; month: number; day: number } {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const target = new Date(week1Monday.getTime() + (isoWeek - 1) * 7 * 86400000);
  return { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate() };
}

export function computePeriodKey(
  series: Pick<RecurringTicketSeries, "cadence">,
  referenceDate: Date,
): string {
  const { year, month, day } = nairobiDateParts(referenceDate);
  if (series.cadence === "monthly") {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  const { isoYear, isoWeek } = computeIsoWeek(new Date(Date.UTC(year, month - 1, day)));
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

export function computeScheduledWindow(
  series: Pick<RecurringTicketSeries, "cadence" | "createWeekday" | "closeWeekday" | "createDayOfMonth" | "closeDayOfMonth">,
  periodKey: string,
): { createDate: Date; closeDate: Date } {
  if (series.cadence === "monthly") {
    const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
    if (!match) throw new Error(`Invalid monthly periodKey: ${periodKey}`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const createDay = Math.min(series.createDayOfMonth, lastDay);
    const closeDay = Math.min(series.closeDayOfMonth ?? lastDay, lastDay);
    return {
      createDate: nairobiDayMarker(year, month, createDay),
      closeDate: nairobiDayMarker(year, month, closeDay),
    };
  }

  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (!match) throw new Error(`Invalid weekly periodKey: ${periodKey}`);
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  const monday = isoWeekMonday(isoYear, isoWeek);
  const mondayUtcMs = Date.UTC(monday.year, monday.month - 1, monday.day);
  const createDay = new Date(mondayUtcMs + (series.createWeekday - 1) * 86400000);
  const closeDay = new Date(mondayUtcMs + (series.closeWeekday - 1) * 86400000);
  return {
    createDate: nairobiDayMarker(createDay.getUTCFullYear(), createDay.getUTCMonth() + 1, createDay.getUTCDate()),
    closeDate: nairobiDayMarker(closeDay.getUTCFullYear(), closeDay.getUTCMonth() + 1, closeDay.getUTCDate()),
  };
}

export function renderSubject(
  template: string,
  ctx: { week?: number; year: number; month?: number; monthName?: string },
): string {
  return template
    .replace(/\{\{week\}\}/g, ctx.week !== undefined ? String(ctx.week) : "")
    .replace(/\{\{year\}\}/g, String(ctx.year))
    .replace(/\{\{month\}\}/g, ctx.month !== undefined ? String(ctx.month) : "")
    .replace(/\{\{monthName\}\}/g, ctx.monthName ?? "");
}

function subjectContextFromPeriodKey(periodKey: string, fallbackDate: Date): { week?: number; year: number; month?: number; monthName?: string } {
  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (weekMatch) {
    return { year: Number(weekMatch[1]), week: Number(weekMatch[2]) };
  }
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (monthMatch) {
    const month = Number(monthMatch[2]);
    return { year: Number(monthMatch[1]), month, monthName: MONTH_NAMES[month - 1] };
  }
  return { year: fallbackDate.getUTCFullYear() };
}

export async function getDueSeriesForCreate(userId: string, today: Date): Promise<RecurringTicketSeries[]> {
  const series = await prisma.recurringTicketSeries.findMany({
    where: { userId, isActive: true },
  });
  const todayMarker = nairobiCalendarDateAsUtc(today).getTime();

  const due: RecurringTicketSeries[] = [];
  for (const s of series) {
    const periodKey = computePeriodKey(s, today);
    const window = computeScheduledWindow(s, periodKey);
    if (window.createDate.getTime() > todayMarker) continue;

    const existing = await prisma.recurringTicketInstance.findUnique({
      where: { seriesId_periodKey: { seriesId: s.id, periodKey } },
    });
    if (existing) continue;

    due.push(s);
  }
  return due;
}

export async function createInstance(
  series: RecurringTicketSeries,
  periodKey: string,
  client: RedmineClient,
): Promise<RecurringTicketInstance> {
  const window = computeScheduledWindow(series, periodKey);
  const subject = renderSubject(series.subjectTemplate, subjectContextFromPeriodKey(periodKey, window.createDate));
  const customFields = (series.customFieldsJson as Array<{ id: number; value: string }> | null) ?? undefined;

  const created = await client.createIssue({
    subject,
    description: series.descriptionTemplate ?? undefined,
    projectId: series.redmineProjectId,
    priorityId: series.priorityId,
    trackerId: series.trackerId,
    assignedToId: series.assignedToId ?? undefined,
    categoryId: series.categoryId ?? undefined,
    customFields,
    parentIssueId: series.parentIssueId,
    startDate: window.createDate.toISOString().slice(0, 10),
    dueDate: window.closeDate.toISOString().slice(0, 10),
  });

  // localIssueNumber is derived from max()+1, which races another writer onto
  // the same number and trips the (userId, source, localIssueNumber) unique
  // constraint — retry a few times, recomputing the max each pass, mirroring
  // autoCreateTicketsForUnmatched in correlation.ts.
  let issue: Awaited<ReturnType<typeof prisma.issue.create>> | null = null;
  for (let attempt = 0; attempt < 5 && !issue; attempt++) {
    const maxNumber = await prisma.issue.aggregate({
      where: { userId: series.userId, source: "local" },
      _max: { localIssueNumber: true },
    });
    const localIssueNumber = (maxNumber._max.localIssueNumber ?? 0) + 1;

    try {
      issue = await prisma.issue.create({
        data: {
          userId: series.userId,
          source: "local",
          localIssueNumber,
          redmineIssueId: created.id,
          redmineBaseUrl: client.normalizedBaseUrl,
          subject,
          description: series.descriptionTemplate ?? undefined,
          projectName: series.name,
          priorityId: series.priorityId,
          categoryId: series.categoryId ?? undefined,
          statusId: 1,
          statusName: "New",
          assignedToId: series.assignedToId ?? undefined,
          estimatedHours: series.estimatedHours ?? undefined,
          updatedOnRemote: new Date(),
          lastActivityAt: new Date(),
          lastActivityType: "recurring_ticket_created",
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") continue;
      throw error;
    }
  }
  if (!issue) {
    throw new Error(`Failed to create local mirror issue for recurring series ${series.key} (period ${periodKey})`);
  }

  // Tear down the series' previous link before creating the new one — see
  // module-level note in the SHA-44 design about the resulting gap window,
  // mitigated by pushPendingWakaTimeEntriesToRedmine scanning by link
  // existence rather than instance status.
  await prisma.issueGithubLink.deleteMany({
    where: { userId: series.userId, repositoryFullName: series.wakatimeProjectName },
  });
  const link = await prisma.issueGithubLink.create({
    data: {
      issueId: issue.id,
      userId: series.userId,
      repositoryFullName: series.wakatimeProjectName,
      url: `converge://recurring/${series.key}/${periodKey}`,
    },
  });

  const instance = await prisma.recurringTicketInstance.create({
    data: {
      seriesId: series.id,
      userId: series.userId,
      periodKey,
      redmineIssueId: created.id,
      issueId: issue.id,
      githubLinkId: link.id,
      subject,
      scheduledCreateDate: window.createDate,
      scheduledCloseDate: window.closeDate,
      status: "open",
    },
  });

  await recordIssueActivityEvent({
    issueId: issue.id,
    eventType: "issue_update",
    source: "local",
    sourceRemoteId: String(created.id),
    eventAt: issue.createdAt,
    summary: `Recurring ticket created: ${subject}`,
  });
  await recomputeIssueActivityIndex(issue.id);

  return instance;
}

export type InstanceDueForClose = RecurringTicketInstance & { series: RecurringTicketSeries };

export async function getInstancesDueForClose(userId: string, today: Date): Promise<InstanceDueForClose[]> {
  const todayMarker = nairobiCalendarDateAsUtc(today);
  return prisma.recurringTicketInstance.findMany({
    where: {
      userId,
      status: { in: ["open", "close_failed"] },
      scheduledCloseDate: { lte: todayMarker },
    },
    include: { series: true },
  }) as Promise<InstanceDueForClose[]>;
}

/**
 * Push TimeEntry rows that WakaTime correlation has written locally
 * (source:"wakatime") but never sent to real Redmine (redmineTimeEntryId:
 * null) up to the given issue's real Redmine ticket. Idempotent: once a row
 * is stamped with a redmineTimeEntryId it's excluded on the next scan.
 */
export async function pushPendingWakaTimeEntriesToRedmine(
  issueId: string,
  client: RedmineClient,
): Promise<{ pushed: number; hours: number }> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    select: { redmineIssueId: true },
  });
  if (!issue?.redmineIssueId) return { pushed: 0, hours: 0 };

  const pending = await prisma.timeEntry.findMany({
    where: { issueId, source: "wakatime", redmineTimeEntryId: null },
    orderBy: { spentOn: "asc" },
  });

  let pushed = 0;
  let hours = 0;
  for (const entry of pending) {
    const result = await client.addTimeEntry({
      issueId: issue.redmineIssueId,
      hours: entry.hours,
      activityId: entry.activityId,
      comments: entry.comments ?? undefined,
      spentOn: entry.spentOn.toISOString().slice(0, 10),
    });

    const redmineTimeEntryId = result?.time_entry?.id;
    if (redmineTimeEntryId) {
      try {
        await prisma.timeEntry.update({
          where: { id: entry.id },
          data: { redmineTimeEntryId },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }

    pushed++;
    hours += entry.hours;
  }

  return { pushed, hours };
}

export async function closeInstance(instance: RecurringTicketInstance, client: RedmineClient): Promise<void> {
  if (!instance.issueId) {
    throw new Error(`Recurring ticket instance ${instance.id} has no linked local issue`);
  }

  const startDate = instance.scheduledCreateDate.toISOString().slice(0, 10);
  const endDate = instance.scheduledCloseDate.toISOString().slice(0, 10);
  await applyTimeEntries(instance.userId, { start: startDate, end: endDate });

  const { pushed, hours } = await pushPendingWakaTimeEntriesToRedmine(instance.issueId, client);
  const closeNote = `Auto-closed by recurring ticket automation. ${pushed} time entr${pushed === 1 ? "y" : "ies"} pushed (${hours.toFixed(2)}h).`;

  try {
    await client.updateIssueStatus(instance.redmineIssueId, REDMINE_STATUS_CLOSED, closeNote);
    await prisma.recurringTicketInstance.update({
      where: { id: instance.id },
      data: { status: "closed", closedAt: new Date(), finalHoursApplied: hours, closeAttempts: { increment: 1 } },
    });
    await prisma.issue.update({
      where: { id: instance.issueId },
      data: {
        statusId: REDMINE_STATUS_CLOSED,
        statusName: "Closed",
        lastActivityAt: new Date(),
        lastActivityType: "recurring_ticket_closed",
      },
    });
    return;
  } catch (closeError) {
    const closeMessage = closeError instanceof Error ? closeError.message : String(closeError);

    // Only the ticket's Redmine author can Close it — fall back to Resolved
    // so the ticket doesn't sit open forever. The DB write happens AFTER this
    // call settles (not before) so that if the fallback itself fails too, the
    // instance is left in "close_failed" — still inside getInstancesDueForClose's
    // retry filter — instead of prematurely marked "resolved_not_closed" with
    // no real Resolve having happened and no future retry ever picking it up.
    try {
      await client.updateIssueStatus(
        instance.redmineIssueId,
        REDMINE_STATUS_RESOLVED,
        `Auto-close failed (${closeMessage}); resolved instead.`,
      );
      await prisma.recurringTicketInstance.update({
        where: { id: instance.id },
        data: {
          status: "resolved_not_closed",
          lastError: closeMessage,
          finalHoursApplied: hours,
          closeAttempts: { increment: 1 },
        },
      });
      await prisma.issue.update({
        where: { id: instance.issueId },
        data: {
          statusId: REDMINE_STATUS_RESOLVED,
          statusName: "Resolved",
          lastActivityAt: new Date(),
          lastActivityType: "recurring_ticket_resolve_fallback",
        },
      });
    } catch (resolveError) {
      const resolveMessage = resolveError instanceof Error ? resolveError.message : String(resolveError);
      await prisma.recurringTicketInstance.update({
        where: { id: instance.id },
        data: {
          status: "close_failed",
          lastError: `Close failed (${closeMessage}); Resolve fallback also failed (${resolveMessage}).`,
          finalHoursApplied: hours,
          closeAttempts: { increment: 1 },
        },
      });
      throw resolveError;
    }
  }
}

export type TickResult = {
  created: Array<{ seriesKey: string; periodKey: string; issueId: string; redmineIssueId: number }>;
  createFailures: Array<{ seriesKey: string; periodKey: string; error: string }>;
  closed: Array<{
    instanceId: string;
    issueId: string;
    seriesKey: string;
    expectsTime: boolean;
    status: string;
    hoursApplied: number | null;
    closeAttempts: number;
  }>;
  closeFailures: Array<{ instanceId: string; error: string }>;
};

export async function runRecurringTicketsTick(
  userId: string,
  client: RedmineClient,
  today: Date = new Date(),
): Promise<TickResult> {
  const result: TickResult = { created: [], createFailures: [], closed: [], closeFailures: [] };

  try {
    const currentUser = await client.getCurrentUser();
    if (currentUser.id !== REDMINE_EXPECTED_AUTHOR_ID) {
      logEvent(
        "recurring_tickets.author_mismatch",
        { expected: REDMINE_EXPECTED_AUTHOR_ID, actual: currentUser.id },
        "warn",
      );
    }
  } catch (error) {
    logEvent("recurring_tickets.current_user_check_failed", { error }, "warn");
  }

  const dueSeries = await getDueSeriesForCreate(userId, today);
  for (const series of dueSeries) {
    const periodKey = computePeriodKey(series, today);
    try {
      const instance = await createInstance(series, periodKey, client);
      result.created.push({
        seriesKey: series.key,
        periodKey,
        issueId: instance.issueId as string,
        redmineIssueId: instance.redmineIssueId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("recurring_tickets.create_failed", { seriesKey: series.key, periodKey, error: message }, "error");
      result.createFailures.push({ seriesKey: series.key, periodKey, error: message });
    }
  }

  const dueClose = await getInstancesDueForClose(userId, today);
  for (const instance of dueClose) {
    try {
      await closeInstance(instance, client);
      const updated = await prisma.recurringTicketInstance.findUnique({ where: { id: instance.id } });
      result.closed.push({
        instanceId: instance.id,
        issueId: instance.issueId as string,
        seriesKey: instance.series.key,
        expectsTime: instance.series.expectsTime,
        status: updated?.status ?? "unknown",
        hoursApplied: updated?.finalHoursApplied ?? null,
        closeAttempts: updated?.closeAttempts ?? instance.closeAttempts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("recurring_tickets.close_failed", { instanceId: instance.id, error: message }, "error");
      result.closeFailures.push({ instanceId: instance.id, error: message });
    }
  }

  return result;
}
