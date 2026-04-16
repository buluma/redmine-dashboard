import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function isDoneStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s.includes("closed") || s.includes("resolved") || s.includes("success") || s.includes("done");
}

function isBlockedStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s.includes("blocked") || s.includes("hold") || s.includes("pause") || s.includes("waiting");
}

function isInProgressStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s.includes("progress") || s.includes("review") || s.includes("testing") || s.includes("redev");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDays(value: string | null): number {
  const parsed = Number.parseInt(value ?? "30", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }
  return Math.min(parsed, 365);
}

function parseDateOnly(value: string | null): Date | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(23, 59, 59, 999);
  return out;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDaySeries(rawEntries: { day: string; value: number }[], windowStart: Date, windowEnd: Date) {
  const map = new Map<string, number>();
  for (const e of rawEntries) {
    map.set(e.day, (map.get(e.day) ?? 0) + e.value);
  }
  const out: { key: string; value: number }[] = [];
  const cursor = startOfDay(windowStart);
  const end = startOfDay(windowEnd);
  while (cursor.getTime() <= end.getTime()) {
    const key = dayKey(cursor);
    out.push({ key, value: map.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function parseAssignees(value: string | null): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export async function GET(request: Request) {
  try {
    const { user } = await requireRedmineClient();
    const { searchParams } = new URL(request.url);
    const days = parseDays(searchParams.get("days"));
    const issueIdRaw = searchParams.get("issueId");
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const assignees = parseAssignees(searchParams.get("assignees"));

    let issueId: number | null = null;
    if (issueIdRaw && issueIdRaw.trim().length > 0) {
      const parsed = Number.parseInt(issueIdRaw.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return Response.json({ error: "Invalid issueId filter" }, { status: 400 });
      }
      issueId = parsed;
    }

    const fromDate = parseDateOnly(fromRaw);
    const toDate = parseDateOnly(toRaw);
    if ((fromRaw && !fromDate) || (toRaw && !toDate)) {
      return Response.json({ error: "Invalid date filter. Expected YYYY-MM-DD." }, { status: 400 });
    }

    let windowStart: Date;
    let windowEnd: Date;
    if (fromDate && toDate) {
      windowStart = startOfDay(fromDate);
      windowEnd = endOfDay(toDate);
    } else if (fromDate) {
      windowStart = startOfDay(fromDate);
      windowEnd = endOfDay(new Date());
    } else if (toDate) {
      windowEnd = endOfDay(toDate);
      windowStart = startOfDay(new Date(windowEnd.getTime() - (days - 1) * DAY_MS));
    } else {
      windowEnd = endOfDay(new Date());
      windowStart = startOfDay(new Date(windowEnd.getTime() - (days - 1) * DAY_MS));
    }

    if (windowStart.getTime() > windowEnd.getTime()) {
      return Response.json({ error: "Invalid date range. 'from' must be before or equal to 'to'." }, { status: 400 });
    }

    const issueWhere: Prisma.IssueWhereInput = {
      userId: user.id,
      ...(issueId ? { redmineIssueId: issueId } : {}),
      ...(fromDate || toDate
        ? {
            updatedOnRemote: {
              ...(fromDate ? { gte: startOfDay(fromDate) } : {}),
              ...(toDate ? { lte: endOfDay(toDate) } : {}),
            },
          }
        : {}),
    };

    if (assignees.length > 0) {
      issueWhere.OR = assignees.map((name) => {
        const normalized = name.toLowerCase();
        if (normalized === "unassigned" || normalized === "nobody") {
          return {
            OR: [
              { assignedToName: null },
              { assignedToName: "" },
              { assignedToName: "Nobody" },
            ],
          };
        }
        return {
          assignedToName: { equals: name },
        };
      });
    }

    // Run heavy report queries in sequence to avoid connection-pool starvation under load.
    const statusDist = await prisma.issue.groupBy({
      by: ["statusName"],
      where: issueWhere,
      _count: { statusName: true },
      orderBy: { _count: { statusName: "desc" } },
    });
    const priorityDist = await prisma.issue.groupBy({
      by: ["priority"],
      where: issueWhere,
      _count: { priority: true },
      orderBy: { _count: { priority: "desc" } },
    });
    const trackerDist = await prisma.issue.groupBy({
      by: ["tracker"],
      where: issueWhere,
      _count: { tracker: true },
      orderBy: { _count: { tracker: "desc" } },
    });
    const categoryDist = await prisma.issue.groupBy({
      by: ["categoryName"],
      where: issueWhere,
      _count: { categoryName: true },
      orderBy: { _count: { categoryName: "desc" } },
    });
    const projectDist = await prisma.issue.groupBy({
      by: ["projectName"],
      where: issueWhere,
      _count: { projectName: true },
      orderBy: { _count: { projectName: "desc" } },
    });
    const assigneeDist = await prisma.issue.groupBy({
      by: ["assignedToName"],
      where: issueWhere,
      _count: { assignedToName: true },
      orderBy: { _count: { assignedToName: "desc" } },
    });
    const totalIssues = await prisma.issue.count({ where: issueWhere });
    const totalWithDueDate = await prisma.issue.count({
      where: {
        ...issueWhere,
        dueDate: { not: null },
      },
    });
    const overdueByParent = await prisma.issue.findMany({
      where: {
        ...issueWhere,
        dueDate: { lte: new Date() },
        statusName: { notIn: ["Closed", "Resolved", "Success"] },
      },
      select: { parentIssueLabel: true },
    });
    const journalsByDay = await prisma.issueJournal.groupBy({
      by: ["createdOnRemote"],
      where: {
        issue: issueWhere,
        createdOnRemote: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      _count: { id: true },
    });
    const timeEntriesByDay = await prisma.timeEntry.groupBy({
      by: ["spentOn"],
      where: {
        issue: issueWhere,
        spentOn: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      _sum: { hours: true },
      _count: { id: true },
    });
    const timeEntriesTotal = await prisma.timeEntry.aggregate({
      where: {
        issue: issueWhere,
        spentOn: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      _sum: { hours: true },
      _count: { id: true },
    });
    const timeEntriesByActivity = await prisma.timeEntry.groupBy({
      by: ["activityName"],
      where: {
        issue: issueWhere,
        spentOn: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      _sum: { hours: true },
      _count: { id: true },
      orderBy: { _sum: { hours: "desc" } },
    });
    const timeEntriesByUser = await prisma.timeEntry.groupBy({
      by: ["authorName"],
      where: {
        issue: issueWhere,
        spentOn: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      _sum: { hours: true },
      _count: { id: true },
      orderBy: { _sum: { hours: "desc" } },
    });
    const recentJournals = await prisma.issueJournal.findMany({
      where: {
        issue: issueWhere,
        createdOnRemote: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { createdOnRemote: "desc" },
      take: 20,
      select: {
        id: true,
        issue: { select: { redmineIssueId: true, subject: true } },
        author: true,
        notes: true,
        createdOnRemote: true,
      },
    });
    const recentTimeEntries = await prisma.timeEntry.findMany({
      where: {
        issue: issueWhere,
        spentOn: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      orderBy: { spentOn: "desc" },
      take: 20,
      select: {
        id: true,
        hours: true,
        activityName: true,
        authorName: true,
        spentOn: true,
        issue: { select: { redmineIssueId: true, subject: true } },
      },
    });
    const issueHealthRows = await prisma.issue.findMany({
      where: issueWhere,
      select: {
        statusName: true,
        dueDate: true,
        updatedOnRemote: true,
        doneRatio: true,
        assignedToName: true,
        estimatedHours: true,
        spentHours: true,
      },
    });

    // Build parent label map
    const parentLabels = new Map<number, string>();
    if (overdueByParent.length > 0) {
      const parentIds = overdueByParent
        .map(i => i.parentIssueLabel)
        .filter((l): l is string => l != null && typeof l === "string")
        .map(l => parseInt(l.replace("#", ""), 10))
        .filter(n => !isNaN(n));

      if (parentIds.length > 0) {
        const parents = await prisma.issue.findMany({
          where: { redmineIssueId: { in: parentIds } },
          select: { redmineIssueId: true, subject: true },
        });
        for (const p of parents) {
          if (p.redmineIssueId) {
            parentLabels.set(p.redmineIssueId, p.subject);
          }
        }
      }
    }

    const overdueByParentMap = new Map<string, number>();
    for (const issue of overdueByParent) {
      const label = issue.parentIssueLabel || "No parent";
      overdueByParentMap.set(label, (overdueByParentMap.get(label) ?? 0) + 1);
    }

    // Helper: group by day
    const journalDayEntries = journalsByDay.map(j => ({
      day: dayKey(j.createdOnRemote),
      value: j._count.id,
    }));

    const timeDayEntries = timeEntriesByDay.map(t => ({
      day: dayKey(t.spentOn),
      value: Number((t._sum.hours ?? 0).toFixed(1)),
    }));

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const dueBuckets = new Map<string, number>([
      ["Overdue", 0],
      ["Due 0-3d", 0],
      ["Due 4-14d", 0],
      ["Due 15d+", 0],
      ["No due date", 0],
    ]);

    const agingBuckets = new Map<string, number>([
      ["Activity < 7d", 0],
      ["Activity 7-30d", 0],
      ["Activity 31-90d", 0],
      ["Activity > 90d", 0],
    ]);

    const progressBuckets = new Map<string, number>([
      ["0%", 0],
      ["1-39%", 0],
      ["40-79%", 0],
      ["80-99%", 0],
      ["100%", 0],
    ]);

    let openIssues = 0;
    let closedIssues = 0;
    let blockedOpenIssues = 0;
    let inProgressOpenIssues = 0;
    let overdueOpenIssues = 0;
    let unassignedOpenIssues = 0;
    let staleOpenIssues7d = 0;
    let staleOpenIssues30d = 0;
    let doneRatioSumOpen = 0;
    let openWithDoneRatio = 0;
    let estimatedOpenIssues = 0;
    let spentOpenIssues = 0;
    let overspentOpenIssues = 0;

    for (const issue of issueHealthRows) {
      const done = isDoneStatus(issue.statusName);
      const blocked = isBlockedStatus(issue.statusName);
      const inProgress = isInProgressStatus(issue.statusName);
      const doneRatio = issue.doneRatio ?? 0;

      if (done) closedIssues += 1;
      else openIssues += 1;

      if (doneRatio === 0) progressBuckets.set("0%", (progressBuckets.get("0%") ?? 0) + 1);
      else if (doneRatio < 40) progressBuckets.set("1-39%", (progressBuckets.get("1-39%") ?? 0) + 1);
      else if (doneRatio < 80) progressBuckets.set("40-79%", (progressBuckets.get("40-79%") ?? 0) + 1);
      else if (doneRatio < 100) progressBuckets.set("80-99%", (progressBuckets.get("80-99%") ?? 0) + 1);
      else progressBuckets.set("100%", (progressBuckets.get("100%") ?? 0) + 1);

      if (!issue.dueDate) {
        dueBuckets.set("No due date", (dueBuckets.get("No due date") ?? 0) + 1);
      } else {
        const due = new Date(issue.dueDate.getFullYear(), issue.dueDate.getMonth(), issue.dueDate.getDate());
        const diffDays = Math.floor((due.getTime() - dayStart.getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays < 0) dueBuckets.set("Overdue", (dueBuckets.get("Overdue") ?? 0) + 1);
        else if (diffDays <= 3) dueBuckets.set("Due 0-3d", (dueBuckets.get("Due 0-3d") ?? 0) + 1);
        else if (diffDays <= 14) dueBuckets.set("Due 4-14d", (dueBuckets.get("Due 4-14d") ?? 0) + 1);
        else dueBuckets.set("Due 15d+", (dueBuckets.get("Due 15d+") ?? 0) + 1);
      }

      const activityAt = issue.updatedOnRemote;
      const staleDays = Math.floor((dayStart.getTime() - new Date(activityAt).getTime()) / (24 * 60 * 60 * 1000));
      if (staleDays < 7) agingBuckets.set("Activity < 7d", (agingBuckets.get("Activity < 7d") ?? 0) + 1);
      else if (staleDays <= 30) agingBuckets.set("Activity 7-30d", (agingBuckets.get("Activity 7-30d") ?? 0) + 1);
      else if (staleDays <= 90) agingBuckets.set("Activity 31-90d", (agingBuckets.get("Activity 31-90d") ?? 0) + 1);
      else agingBuckets.set("Activity > 90d", (agingBuckets.get("Activity > 90d") ?? 0) + 1);

      if (!done) {
        if (blocked) blockedOpenIssues += 1;
        if (inProgress) inProgressOpenIssues += 1;
        if (!issue.assignedToName || issue.assignedToName.trim().length === 0 || issue.assignedToName === "Nobody") {
          unassignedOpenIssues += 1;
        }
        if (issue.dueDate && issue.dueDate < dayStart) overdueOpenIssues += 1;
        if (staleDays >= 7) staleOpenIssues7d += 1;
        if (staleDays >= 30) staleOpenIssues30d += 1;

        doneRatioSumOpen += doneRatio;
        openWithDoneRatio += 1;

        if ((issue.estimatedHours ?? 0) > 0) estimatedOpenIssues += 1;
        if ((issue.spentHours ?? 0) > 0) spentOpenIssues += 1;
        if ((issue.estimatedHours ?? 0) > 0 && (issue.spentHours ?? 0) > (issue.estimatedHours ?? 0)) {
          overspentOpenIssues += 1;
        }
      }
    }

    return Response.json({
      aggregates: {
        byStatus: statusDist.map(s => ({ name: s.statusName, count: s._count.statusName })),
        byPriority: priorityDist.map(p => ({ name: p.priority || "Unset", count: p._count.priority })),
        byTracker: trackerDist.map(t => ({ name: t.tracker || "Unknown", count: t._count.tracker })),
        byCategory: categoryDist
          .slice(0, 10)
          .map(c => ({ name: c.categoryName || "Uncategorized", count: c._count.categoryName })),
        byProject: projectDist.slice(0, 10).map(p => ({ name: p.projectName || "Unknown", count: p._count.projectName })),
        byAssignee: assigneeDist.slice(0, 10).map(a => ({ name: a.assignedToName || "Unassigned", count: a._count.assignedToName })),
      },
      stats: {
        totalIssues,
        totalWithDueDate,
        overdueParents: Array.from(overdueByParentMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([label, count]) => ({ label, count })),
        totalTimeHours: Number((timeEntriesTotal._sum.hours ?? 0).toFixed(1)),
        totalTimelogs: timeEntriesTotal._count.id,
        openIssues,
        closedIssues,
        blockedOpenIssues,
        inProgressOpenIssues,
        overdueOpenIssues,
        unassignedOpenIssues,
        staleOpenIssues7d,
        staleOpenIssues30d,
        avgDoneRatioOpen: openWithDoneRatio > 0 ? Math.round(doneRatioSumOpen / openWithDoneRatio) : 0,
        estimatedOpenIssues,
        spentOpenIssues,
        overspentOpenIssues,
      },
      trends: {
        journalDaySeries: buildDaySeries(journalDayEntries, windowStart, windowEnd),
        timeDaySeries: buildDaySeries(timeDayEntries, windowStart, windowEnd),
        byActivity: timeEntriesByActivity.slice(0, 8).map(a => ({
          name: a.activityName || "Unknown",
          hours: Number((a._sum.hours ?? 0).toFixed(1)),
          count: a._count.id,
        })),
        byUser: timeEntriesByUser.slice(0, 8).map(u => ({
          name: u.authorName || "Unknown",
          hours: Number((u._sum.hours ?? 0).toFixed(1)),
          count: u._count.id,
        })),
        dueBuckets: Array.from(dueBuckets.entries()).map(([name, count]) => ({ name, count })),
        agingBuckets: Array.from(agingBuckets.entries()).map(([name, count]) => ({ name, count })),
        progressBuckets: Array.from(progressBuckets.entries()).map(([name, count]) => ({ name, count })),
      },
      recent: {
        journals: recentJournals.map(j => ({
          id: j.id,
          issueId: j.issue.redmineIssueId,
          issueSubject: j.issue.subject,
          author: j.author,
          notes: j.notes,
          createdOnRemote: j.createdOnRemote.toISOString(),
        })),
        timeEntries: recentTimeEntries.map(t => ({
          id: t.id,
          issueId: t.issue.redmineIssueId,
          issueSubject: t.issue.subject,
          hours: t.hours,
          activityName: t.activityName,
          authorName: t.authorName,
          spentOn: t.spentOn.toISOString().slice(0, 10),
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch report data";
    const timeout = message.includes("statement timeout") || message.includes("code: \"57014\"") || message.includes("P2024");
    const status = message === "Unauthorized" ? 401 : timeout ? 503 : 400;
    return Response.json({ error: message }, { status });
  }
}
