import type { RedmineClient } from '@/src/lib/redmine';
import { prisma } from '@/src/lib/db';
import { correlateWakaTime } from '@/src/lib/correlation';
import { parseIssueRef } from '@/src/lib/ai-tools/issue-ref';

// ---------------------------------------------------------------------------
// Individual tool handlers — read-only
// ---------------------------------------------------------------------------

export async function handleGetIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);

  if (ref.kind === 'local') {
    const localTicket = await prisma.issue.findFirst({
      where: { userId, source: 'local', localIssueNumber: ref.n },
      include: {
        journals: { orderBy: { createdOnRemote: 'desc' }, take: 10 },
        timeEntries: { orderBy: { spentOn: 'desc' }, take: 5 },
      },
    });
    if (!localTicket) {
      throw new Error(`Local ticket L-${ref.n} not found`);
    }
    return {
      ref: `L-${ref.n}`,
      subject: localTicket.subject,
      status: localTicket.statusName,
      priority: localTicket.priority,
      assignedTo: localTicket.assignedToName,
      dueDate: localTicket.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: localTicket.doneRatio,
      tracker: localTicket.tracker,
      project: localTicket.projectName,
      spentHours: localTicket.spentHours,
      description: localTicket.description?.slice(0, 2000) ?? null,
      updatedOn: localTicket.updatedOnRemote.toISOString(),
      recentJournals: localTicket.journals.slice(0, 5).map((j) => ({
        author: j.author,
        notes: j.notes?.slice(0, 500) ?? null,
        createdOn: j.createdOnRemote?.toISOString() ?? null,
      })),
      recentTimeEntries: localTicket.timeEntries.slice(0, 5).map((t) => ({
        hours: t.hours,
        activity: t.activityName,
        author: t.authorName,
        spentOn: t.spentOn?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  const issueId = ref.id;

  // Try local DB first for richer data
  const local = await prisma.issue.findFirst({
    where: { userId, redmineIssueId: issueId },
    include: {
      journals: { orderBy: { createdOnRemote: 'desc' }, take: 10 },
      timeEntries: { orderBy: { spentOn: 'desc' }, take: 5 },
    },
  });

  if (local) {
    return {
      issueId: local.redmineIssueId,
      subject: local.subject,
      status: local.statusName,
      priority: local.priority,
      assignedTo: local.assignedToName,
      dueDate: local.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: local.doneRatio,
      tracker: local.tracker,
      project: local.projectName,
      description: local.description?.slice(0, 2000) ?? null,
      updatedOn: local.updatedOnRemote.toISOString(),
      recentJournals: local.journals.slice(0, 5).map((j) => ({
        author: j.author,
        notes: j.notes?.slice(0, 500) ?? null,
        createdOn: j.createdOnRemote?.toISOString() ?? null,
      })),
      recentTimeEntries: local.timeEntries.slice(0, 5).map((t) => ({
        hours: t.hours,
        activity: t.activityName,
        author: t.authorName,
        spentOn: t.spentOn?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  // Fallback to Redmine API
  const detail = await client.getIssue(issueId, ['journals']);
  const issue = detail.issue as Record<string, unknown>;
  return {
    issueId,
    subject: issue.subject,
    status: (issue.status as { name?: string })?.name ?? null,
    priority: (issue.priority as { name?: string })?.name ?? null,
    assignedTo: (issue.assigned_to as { name?: string })?.name ?? null,
    dueDate: issue.due_date ?? null,
    doneRatio: issue.done_ratio ?? null,
    tracker: (issue.tracker as { name?: string })?.name ?? null,
    project: (issue.project as { name?: string })?.name ?? null,
    description: typeof issue.description === 'string' ? issue.description.slice(0, 2000) : null,
    updatedOn: issue.updated_on ?? null,
  };
}

export async function handleSearchIssues(
  args: Record<string, unknown>,
  userId: string,
) {
  const query = String(args.query ?? '');
  if (!query.trim()) {
    throw new Error('query is required');
  }
  const limit = Math.min(Math.max(1, Number(args.limit) || 10), 25);

  const issues = await prisma.issue.findMany({
    where: {
      userId,
      OR: [
        { subject: { contains: query } },
        { description: { contains: query } },
        { assignedToName: { contains: query } },
      ],
    },
    orderBy: { updatedOnRemote: 'desc' },
    take: limit,
    select: {
      redmineIssueId: true,
      localIssueNumber: true,
      source: true,
      subject: true,
      statusName: true,
      priority: true,
      assignedToName: true,
      dueDate: true,
      doneRatio: true,
      projectName: true,
    },
  });

  return {
    count: issues.length,
    issues: issues.map((i) => ({
      ref: i.redmineIssueId != null ? `#${i.redmineIssueId}` : i.localIssueNumber != null ? `L-${i.localIssueNumber}` : null,
      issueId: i.redmineIssueId,
      subject: i.subject,
      status: i.statusName,
      priority: i.priority,
      assignedTo: i.assignedToName,
      dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
      doneRatio: i.doneRatio,
      project: i.projectName,
    })),
  };
}

export async function handleListStatuses(client: RedmineClient) {
  const statuses = await client.getIssueStatuses();
  return {
    statuses: statuses.map((s) => ({
      id: s.id,
      name: s.name,
      isClosed: s.is_closed ?? false,
    })),
  };
}

export async function handleListActivities(client: RedmineClient) {
  const activities = await client.getTimeEntryActivities();
  return {
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
    })),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export async function handleGetTimeSummary(
  args: Record<string, unknown>,
  userId: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = typeof args.start === 'string' && args.start ? args.start : weekAgo;
  const end = typeof args.end === 'string' && args.end ? args.end : today;

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new Error('start and end must be YYYY-MM-DD dates');
  }

  const { matched, unmatched } = await correlateWakaTime(userId, { start, end });

  const perTicket = matched
    .map((m) => ({
      ref: m.localIssueNumber != null ? `L-${m.localIssueNumber}` : null,
      subject: m.subject,
      repo: m.repo,
      hours: secondsToHours(m.totalSeconds),
    }))
    .sort((a, b) => b.hours - a.hours);

  const unmatchedProjects = [...unmatched]
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 5)
    .map((u) => ({ project: u.project, hours: secondsToHours(u.totalSeconds) }));

  return {
    start,
    end,
    totalTrackedHours: secondsToHours(matched.reduce((s, m) => s + m.totalSeconds, 0)),
    perTicket,
    unmatchedHours: secondsToHours(unmatched.reduce((s, u) => s + u.totalSeconds, 0)),
    unmatchedProjects,
    note: 'Hours come from WakaTime coding activity correlated to tickets via linked GitHub repos. Unmatched projects have no ticket link yet.',
  };
}
