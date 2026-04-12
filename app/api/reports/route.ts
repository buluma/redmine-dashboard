import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";

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

    return Response.json({
      aggregates: {
        byStatus: statusDist.map(s => ({ name: s.statusName, count: s._count.statusName })),
        byPriority: priorityDist.map(p => ({ name: p.priority || "Unset", count: p._count.priority })),
        byTracker: trackerDist.map(t => ({ name: t.tracker || "Unknown", count: t._count.tracker })),
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
