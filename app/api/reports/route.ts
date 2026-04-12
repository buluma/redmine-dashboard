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

export async function GET(request: Request) {
  try {
    const { user } = await requireRedmineClient();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Parallel aggregations
    const [
      statusDist,
      priorityDist,
      trackerDist,
      categoryDist,
      projectDist,
      assigneeDist,
      totalIssues,
      totalWithDueDate,
      overdueByParent,
      journalsByDay,
      timeEntriesByDay,
      timeEntriesTotal,
      timeEntriesByActivity,
      timeEntriesByUser,
      recentJournals,
      recentTimeEntries,
      issueHealthRows,
    ] = await Promise.all([
      // Status distribution
      prisma.issue.groupBy({
        by: ["statusName"],
        where: { userId: user.id },
        _count: { statusName: true },
        orderBy: { _count: { statusName: "desc" } },
      }),
      // Priority distribution
      prisma.issue.groupBy({
        by: ["priority"],
        where: { userId: user.id },
        _count: { priority: true },
        orderBy: { _count: { priority: "desc" } },
      }),
      // Tracker distribution
      prisma.issue.groupBy({
        by: ["tracker"],
        where: { userId: user.id },
        _count: { tracker: true },
        orderBy: { _count: { tracker: "desc" } },
      }),
      // Category distribution
      prisma.issue.groupBy({
        by: ["categoryName"],
        where: { userId: user.id },
        _count: { categoryName: true },
        orderBy: { _count: { categoryName: "desc" } },
      }),
      // Project distribution
      prisma.issue.groupBy({
        by: ["projectName"],
        where: { userId: user.id },
        _count: { projectName: true },
        orderBy: { _count: { projectName: "desc" } },
      }),
      // Assignee distribution
      prisma.issue.groupBy({
        by: ["assignedToName"],
        where: { userId: user.id },
        _count: { assignedToName: true },
        orderBy: { _count: { assignedToName: "desc" } },
      }),
      // Total counts
      prisma.issue.count({ where: { userId: user.id } }),
      prisma.issue.count({
        where: {
          userId: user.id,
          dueDate: { not: null },
        },
      }),
      // Overdue issues by parent
      prisma.issue.findMany({
        where: {
          userId: user.id,
          dueDate: { lte: new Date() },
          statusName: { notIn: ["Closed", "Resolved", "Success"] },
        },
        select: { parentIssueLabel: true },
      }),
      // Journals by day (recent window)
      prisma.issueJournal.groupBy({
        by: ["createdOnRemote"],
        where: {
          issue: { userId: user.id },
          createdOnRemote: { gte: since },
        },
        _count: { id: true },
      }),
      // Time entries by day (recent window)
      prisma.timeEntry.groupBy({
        by: ["spentOn"],
        where: {
          issue: { userId: user.id },
          spentOn: { gte: since },
        },
        _sum: { hours: true },
        _count: { id: true },
      }),
      // Total time entries
      prisma.timeEntry.aggregate({
        where: { issue: { userId: user.id } },
        _sum: { hours: true },
        _count: { id: true },
      }),
      // Time entries by activity
      prisma.timeEntry.groupBy({
        by: ["activityName"],
        where: { issue: { userId: user.id } },
        _sum: { hours: true },
        _count: { id: true },
        orderBy: { _sum: { hours: "desc" } },
      }),
      // Time entries by user
      prisma.timeEntry.groupBy({
        by: ["authorName"],
        where: { issue: { userId: user.id } },
        _sum: { hours: true },
        _count: { id: true },
        orderBy: { _sum: { hours: "desc" } },
      }),
      // Recent journals
      prisma.issueJournal.findMany({
        where: { issue: { userId: user.id } },
        orderBy: { createdOnRemote: "desc" },
        take: 20,
        select: {
          id: true,
          issue: { select: { redmineIssueId: true, subject: true } },
          author: true,
          notes: true,
          createdOnRemote: true,
        },
      }),
      // Recent time entries
      prisma.timeEntry.findMany({
        where: { issue: { userId: user.id } },
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
      }),
      // Health + risk computations
      prisma.issue.findMany({
        where: { userId: user.id },
        select: {
          statusName: true,
          dueDate: true,
          updatedOnRemote: true,
          doneRatio: true,
          assignedToName: true,
          estimatedHours: true,
          spentHours: true,
        },
      }),
    ]);

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
          parentLabels.set(p.redmineIssueId, p.subject);
        }
      }
    }

    const overdueByParentMap = new Map<string, number>();
    for (const issue of overdueByParent) {
      const label = issue.parentIssueLabel || "No parent";
      overdueByParentMap.set(label, (overdueByParentMap.get(label) ?? 0) + 1);
    }

    // Helper: group by day
    function dayKey(date: Date): string {
      return date.toISOString().slice(0, 10);
    }

    function buildDaySeries(rawEntries: { day: string; value: number }[], windowDays: number) {
      const map = new Map<string, number>();
      for (const e of rawEntries) {
        map.set(e.day, (map.get(e.day) ?? 0) + e.value);
      }
      const out: { key: string; value: number }[] = [];
      for (let i = windowDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = dayKey(d);
        out.push({ key, value: map.get(key) ?? 0 });
      }
      return out;
    }

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
      ["Updated < 7d", 0],
      ["Updated 7-30d", 0],
      ["Updated 31-90d", 0],
      ["Updated > 90d", 0],
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

      const staleDays = Math.floor((dayStart.getTime() - new Date(issue.updatedOnRemote).getTime()) / (24 * 60 * 60 * 1000));
      if (staleDays < 7) agingBuckets.set("Updated < 7d", (agingBuckets.get("Updated < 7d") ?? 0) + 1);
      else if (staleDays <= 30) agingBuckets.set("Updated 7-30d", (agingBuckets.get("Updated 7-30d") ?? 0) + 1);
      else if (staleDays <= 90) agingBuckets.set("Updated 31-90d", (agingBuckets.get("Updated 31-90d") ?? 0) + 1);
      else agingBuckets.set("Updated > 90d", (agingBuckets.get("Updated > 90d") ?? 0) + 1);

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
        journalDaySeries: buildDaySeries(journalDayEntries, days),
        timeDaySeries: buildDaySeries(timeDayEntries, days),
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
    const status = message === "Unauthorized" ? 401 : 400;
    return Response.json({ error: message }, { status });
  }
}
