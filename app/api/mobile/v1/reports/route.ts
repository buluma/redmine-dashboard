import { requireMobileUser } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { jsonError } from '@/src/lib/http';
import { assertMobileApiEnabled } from '@/src/lib/mobile-api';
import { trackFailure, trackInfo, trackSuccess } from '@/src/lib/telemetry';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    assertMobileApiEnabled();
    const { user } = await requireMobileUser(request);
    trackInfo('mobile.reports.requested', { userId: user.id });

    const now = new Date();
    const soonCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [issues, favorites, syncInfo] = await Promise.all([
      prisma.issue.findMany({
        where: { userId: user.id, source: { not: 'local' } },
        select: {
          redmineIssueId: true,
          statusName: true,
          statusId: true,
          priority: true,
          projectName: true,
          dueDate: true,
          updatedOnRemote: true,
        },
      }),
      prisma.favorite.findMany({
        where: { userId: user.id },
        select: { issueId: true },
      }),
      prisma.syncJob.findFirst({
        where: { userId: user.id, status: 'completed' },
        orderBy: { endedAt: 'desc' },
        select: { endedAt: true },
      }),
    ]);

    const favoritedIds = new Set(favorites.map((f) => f.issueId));

    const CLOSED_STATUSES = ['closed', 'rejected', 'resolved', 'done'];
    const isOpen = (s: { statusName: string }) =>
      !CLOSED_STATUSES.includes(s.statusName.toLowerCase());

    const total = issues.length;
    const open = issues.filter(isOpen).length;
    const closed = total - open;

    const overdue = issues.filter((i) => {
      if (!i.dueDate || !isOpen(i)) return false;
      return new Date(i.dueDate) < now;
    }).length;

    const dueSoon = issues.filter((i) => {
      if (!i.dueDate || !isOpen(i)) return false;
      const d = new Date(i.dueDate);
      return d >= now && d <= soonCutoff;
    }).length;

    const favorited = issues.filter((i) => i.redmineIssueId != null && favoritedIds.has(i.redmineIssueId)).length;

    // By priority
    const priorityMap = new Map<string, number>();
    for (const i of issues) {
      if (!isOpen(i)) continue;
      const p = i.priority ?? 'Unknown';
      priorityMap.set(p, (priorityMap.get(p) ?? 0) + 1);
    }
    const byPriority = [...priorityMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // By project (open + total)
    const projectMap = new Map<string, { open: number; total: number }>();
    for (const i of issues) {
      const p = i.projectName ?? 'Unknown';
      const entry = projectMap.get(p) ?? { open: 0, total: 0 };
      entry.total++;
      if (isOpen(i)) entry.open++;
      projectMap.set(p, entry);
    }
    const byProject = [...projectMap.entries()]
      .map(([name, { open: o, total: t }]) => ({ name, open: o, total: t }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 10);

    // By status (open issues only)
    const statusMap = new Map<string, number>();
    for (const i of issues) {
      if (!isOpen(i)) continue;
      const s = i.statusName || 'Unknown';
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const byStatus = [...statusMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    trackSuccess({
      event: 'mobile.reports.succeeded',
      data: { userId: user.id, total },
      metricName: 'mobile_reports_succeeded',
      durationMetricName: 'mobile_reports_duration',
      durationMs: Date.now() - startedAt,
    });

    return Response.json({
      summary: { total, open, closed, overdue, dueSoon, favorited },
      byPriority,
      byProject,
      byStatus,
      syncInfo: {
        lastSyncAt: syncInfo?.endedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load reports';
    const status = message === 'Unauthorized' ? 401 : 500;
    trackFailure({
      event: 'mobile.reports.failed',
      error,
      metricName: 'mobile_reports_failed',
      metricTags: { status_class: `${Math.floor(status / 100)}xx` },
      durationMetricName: 'mobile_reports_duration',
      durationMs: Date.now() - startedAt,
    });
    return jsonError(message === 'Unauthorized' ? 'Unauthorized' : 'Failed to load reports', status);
  }
}
