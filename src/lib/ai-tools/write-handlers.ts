import type { RedmineClient } from '@/src/lib/redmine';
import { prisma } from '@/src/lib/db';
import { localTouch, parseIssueRef, requireLocalIssue, writeLocalJournal } from '@/src/lib/ai-tools/issue-ref';
import { redmineCatalogScope } from '@/src/lib/redmine-scope';

// ---------------------------------------------------------------------------
// Individual tool handlers — mutating (require confirmation)
// ---------------------------------------------------------------------------

export async function handleUpdateStatus(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const statusId = Number(args.status_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (!Number.isInteger(statusId) || statusId <= 0) {
    throw new Error('status_id must be a positive integer');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const catalog = await prisma.statusCatalog.findMany({
      where: { scope: redmineCatalogScope(userId, client.baseUrl) },
    });
    const status = catalog.find((s) => s.id === statusId);
    if (!status) {
      throw new Error(`Unknown status_id ${statusId} (use list_statuses)`);
    }
    await prisma.issue.update({
      where: { id: issue.id },
      data: { statusId: status.id, statusName: status.name, ...localTouch() },
    });
    await writeLocalJournal(issue.id, note ?? null, [
      { property: 'attr', name: 'status', old_value: issue.statusName, new_value: status.name },
    ]);
    return { ref: `L-${ref.n}`, statusId: status.id, statusName: status.name, note: note ?? null, updated: true };
  }

  await client.updateIssueStatus(ref.id, statusId, note);
  return { issueId: ref.id, statusId, note: note ?? null, updated: true };
}

export async function handleLogTime(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const hours = Number(args.hours);
  const comment = typeof args.comment === 'string' ? args.comment : undefined;
  const spentOn = typeof args.spent_on === 'string'
    ? args.spent_on
    : new Date().toISOString().slice(0, 10);

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error('hours must be between 0 and 24');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const activityId = args.activity_id != null ? Number(args.activity_id) : 9;
    await prisma.timeEntry.create({
      data: {
        issueId: issue.id,
        userId,
        hours,
        spentOn: new Date(spentOn),
        activityId,
        activityName: 'Development',
        comments: comment ?? null,
      },
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { spentHours: { increment: hours }, ...localTouch() },
    });
    return { ref: `L-${ref.n}`, hours, spentOn, comment: comment ?? null, logged: true };
  }

  const activityId = Number(args.activity_id);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    throw new Error('activity_id must be a positive integer');
  }

  const res = await client.addTimeEntry({
    issueId: ref.id, hours, activityId, comments: comment, spentOn,
  });

  return {
    issueId: ref.id,
    hours,
    activityId,
    spentOn,
    comment: comment ?? null,
    timeEntryId: res?.time_entry?.id ?? null,
    logged: true,
  };
}

export async function handleAddComment(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const comment = String(args.comment ?? '');

  if (!comment.trim()) {
    throw new Error('comment is required');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    await writeLocalJournal(issue.id, comment);
    await prisma.issue.update({ where: { id: issue.id }, data: localTouch() });
    return { ref: `L-${ref.n}`, comment, posted: true };
  }

  await client.addComment(ref.id, comment);
  return { issueId: ref.id, comment, posted: true };
}

export async function handleCloseIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);
  const note = typeof args.note === 'string' ? args.note : undefined;

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const catalog = await prisma.statusCatalog.findMany({
      where: { scope: redmineCatalogScope(userId, client.baseUrl) },
    });
    const closed = catalog.find((s) => s.name.toLowerCase() === 'closed') ?? catalog.find((s) => s.isClosed);
    if (!closed) {
      throw new Error('No closed status found in the status catalog. Use update_status with a specific status ID instead.');
    }
    await prisma.issue.update({
      where: { id: issue.id },
      data: { statusId: closed.id, statusName: closed.name, ...localTouch() },
    });
    await writeLocalJournal(issue.id, note ?? null, [
      { property: 'attr', name: 'status', old_value: issue.statusName, new_value: closed.name },
    ]);
    return { ref: `L-${ref.n}`, statusId: closed.id, statusName: closed.name, note: note ?? null, closed: true };
  }

  const issueId = ref.id;

  // Find the "Closed" status ID from the Redmine status catalog
  const statuses = await client.getIssueStatuses();
  const closedStatus = statuses.find(
    (s) => s.is_closed === true || s.name.toLowerCase() === 'closed',
  );

  if (!closedStatus) {
    throw new Error('Could not find a "Closed" status in Redmine. Use update_status with a specific status ID instead.');
  }

  await client.updateIssueStatus(issueId, closedStatus.id, note);
  return {
    issueId,
    statusId: closedStatus.id,
    statusName: closedStatus.name,
    note: note ?? null,
    closed: true,
  };
}

export async function handleUpdateIssue(
  args: Record<string, unknown>,
  client: RedmineClient,
  userId: string,
) {
  const ref = parseIssueRef(args.issue_id);

  const updates: Record<string, unknown> = {};
  if (typeof args.due_date === 'string') updates.dueDate = args.due_date;
  if (typeof args.done_ratio === 'number') updates.doneRatio = Math.min(100, Math.max(0, args.done_ratio));
  if (typeof args.estimated_hours === 'number') updates.estimatedHours = args.estimated_hours;
  if (typeof args.note === 'string') updates.notes = args.note;

  if (Object.keys(updates).length === 0) {
    throw new Error('At least one field (due_date, done_ratio, estimated_hours) must be provided');
  }

  if (ref.kind === 'local') {
    const issue = await requireLocalIssue(ref, userId);
    const data: Record<string, unknown> = { ...localTouch() };
    if (typeof updates.dueDate === 'string') data.dueDate = new Date(updates.dueDate);
    if (typeof updates.doneRatio === 'number') data.doneRatio = updates.doneRatio;
    if (typeof updates.estimatedHours === 'number') data.estimatedHours = updates.estimatedHours;
    await prisma.issue.update({ where: { id: issue.id }, data });
    if (typeof updates.notes === 'string') {
      await writeLocalJournal(issue.id, updates.notes);
    }
    return { ref: `L-${ref.n}`, ...updates, updated: true };
  }

  await client.updateIssue(ref.id, updates as {
    dueDate?: string;
    doneRatio?: number;
    estimatedHours?: number;
    notes?: string;
  });

  return { issueId: ref.id, ...updates, updated: true };
}
