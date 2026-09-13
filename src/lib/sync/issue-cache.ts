// Writes one Redmine issue's full detail payload (the issue row itself plus
// its attachments/relations/journals/time-entries) into the local cache.
// syncSingleIssue (./single-issue.ts) is the only orchestrator that calls
// these together; upsertAttachmentsForIssue is also called directly by the
// attachment-refresh route.

import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { RedmineClient } from "@/src/lib/redmine";
import { recordIssueActivityEvent } from "@/src/lib/activity-index";
import {
  asDate,
  asNumber,
  asObject,
  asString,
  nestedId,
  nestedName,
  parentIssueLabel,
  parseAllowedStatuses,
  parseChildren,
} from "@/src/lib/sync/parsers";

export async function upsertIssueFromRemote(
  userId: string,
  redmineBaseUrl: string,
  issueRaw: Record<string, unknown>,
  trackChanges: boolean = false
): Promise<{ issue: typeof issue; wasCreated: boolean; oldState: { statusName: string; priorityName: string | null; assignedToName: string | null; subject: string; dueDate: Date | null; doneRatio: number | null; } | null }> {
  const remoteId = asNumber(issueRaw.id);
  if (!remoteId) {
    throw new Error("Missing remote issue id");
  }

  // Guard: reject local-only issues — they must never sync to Redmine
  const sourceHint = (issueRaw as Record<string, unknown>).__sourceHint;
  if (sourceHint === "local") {
    throw new Error("Refused to upsert local issue into Redmine cache");
  }

  // Fetch existing issue to track changes (if requested)
  let oldState: { statusName: string; priorityName: string | null; assignedToName: string | null; subject: string; dueDate: Date | null; doneRatio: number | null; } | null = null;
  if (trackChanges) {
    const existing = await prisma.issue.findUnique({
      where: {
        userId_redmineBaseUrl_redmineIssueId: {
          userId,
          redmineBaseUrl,
          redmineIssueId: remoteId,
        },
      },
      select: {
        statusName: true,
        priority: true,  // priorityName is stored in 'priority' field
        assignedToName: true,
        subject: true,
        dueDate: true,
        doneRatio: true,
      },
    });
    if (existing) {
      oldState = {
        statusName: existing.statusName,
        priorityName: existing.priority,  // Map priority field to priorityName
        assignedToName: existing.assignedToName,
        subject: existing.subject,
        dueDate: existing.dueDate,
        doneRatio: existing.doneRatio,
      };
    }
  }

  const updatedOn = asDate(issueRaw.updated_on) ?? new Date();
  const payload: Prisma.IssueUncheckedCreateInput = {
    userId,
    redmineIssueId: remoteId,
    redmineBaseUrl,
    subject: asString(issueRaw.subject) ?? `Issue #${remoteId}`,
    description: asString(issueRaw.description),
    projectName: nestedName(issueRaw.project),
    tracker: nestedName(issueRaw.tracker),
    priority: nestedName(issueRaw.priority),
    priorityId: nestedId(issueRaw.priority),
    statusId: nestedId(issueRaw.status) ?? 0,
    statusName: nestedName(issueRaw.status) ?? "Unknown",
    parentIssueId: nestedId(issueRaw.parent),
    parentIssueLabel: parentIssueLabel(issueRaw.parent),
    assignedToId: nestedId(issueRaw.assigned_to),
    assignedToName: nestedName(issueRaw.assigned_to),
    authorId: nestedId(issueRaw.author),
    authorName: nestedName(issueRaw.author),
    categoryId: nestedId(issueRaw.category),
    categoryName: nestedName(issueRaw.category),
    startDate: asDate(issueRaw.start_date),
    estimatedHours: asNumber(issueRaw.estimated_hours),
    spentHours: asNumber(issueRaw.spent_hours),
    customFieldsJson: Array.isArray(issueRaw.custom_fields)
      ? (issueRaw.custom_fields as Prisma.InputJsonValue)
      : Prisma.DbNull,
    updatedOnRemote: updatedOn,
    lastActivityAt: updatedOn,
    lastActivityType: "issue_update",
    dueDate: asDate(issueRaw.due_date),
    doneRatio: asNumber(issueRaw.done_ratio),
    allowedStatusesJson: parseAllowedStatuses(issueRaw) as Prisma.InputJsonValue,
    childrenJson: parseChildren(issueRaw) as Prisma.InputJsonValue,
  };

  // Check if issue exists to determine if this is a create
  const existingBeforeUpsert = await prisma.issue.findUnique({
    where: {
      userId_redmineBaseUrl_redmineIssueId: {
        userId,
        redmineBaseUrl,
        redmineIssueId: remoteId,
      },
    },
  });

  const issue = await prisma.issue.upsert({
    where: {
      userId_redmineBaseUrl_redmineIssueId: {
        userId,
        redmineBaseUrl,
        redmineIssueId: remoteId,
      },
    },
    update: {
      ...payload,
    },
    create: payload,
  });

  const wasCreated = !existingBeforeUpsert;

  await recordIssueActivityEvent({
    issueId: issue.id,
    eventType: "issue_update",
    source: "redmine",
    sourceRemoteId: String(remoteId),
    eventAt: updatedOn,
    summary: asString(issueRaw.subject),
  });

  // Build oldState with updated format if it was set
  const oldStateWithFormat = oldState ? {
    ...oldState,
    dueDate: oldState.dueDate,
    doneRatio: oldState.doneRatio,
  } : null;

  return {
    issue,
    wasCreated,
    oldState: oldStateWithFormat,
  };
}

export async function upsertAttachmentsForIssue(issueId: string, issueRaw: Record<string, unknown>, pruneMissing: boolean) {
  const attachments = asObject(issueRaw).attachments;
  if (!Array.isArray(attachments)) {
    if (pruneMissing) {
      await prisma.issueAttachment.deleteMany({ where: { issueId } });
    }
    return;
  }

  const seenIds: number[] = [];

  for (const itemRaw of attachments) {
    const item = asObject(itemRaw);
    const remoteId = asNumber(item.id);
    const filename = asString(item.filename);
    const downloadUrl = asString(item.content_url) ?? asString(item.url);
    if (!remoteId || !filename || !downloadUrl) {
      continue;
    }

    seenIds.push(remoteId);
    const createdOn = asDate(item.created_on) ?? new Date();
    await prisma.issueAttachment.upsert({
      where: { issueId_redmineAttachmentId: { issueId, redmineAttachmentId: remoteId } },
      update: {
        issueId,
        filename,
        filesize: asNumber(item.filesize) ?? 0,
        contentType: asString(item.content_type),
        author: nestedName(item.author),
        createdOnRemote: createdOn,
        downloadUrl,
      },
      create: {
        redmineAttachmentId: remoteId,
        issueId,
        filename,
        filesize: asNumber(item.filesize) ?? 0,
        contentType: asString(item.content_type),
        author: nestedName(item.author),
        createdOnRemote: createdOn,
        downloadUrl,
      },
    });
    await recordIssueActivityEvent({
      issueId,
      eventType: "attachment",
      source: "redmine",
      sourceRemoteId: String(remoteId),
      eventAt: createdOn,
      summary: filename,
    });
  }

  if (!pruneMissing) return;
  if (seenIds.length === 0) {
    await prisma.issueAttachment.deleteMany({ where: { issueId } });
    return;
  }
  await prisma.issueAttachment.deleteMany({
    where: {
      issueId,
      redmineAttachmentId: { notIn: seenIds },
    },
  });
}

export async function upsertRelationsForIssue(issueId: string, issueRaw: Record<string, unknown>, pruneMissing: boolean) {
  const relations = asObject(issueRaw).relations;
  if (!Array.isArray(relations)) {
    if (pruneMissing) {
      await prisma.issueRelation.deleteMany({ where: { issueId } });
    }
    return;
  }

  const seenIds: number[] = [];

  for (const itemRaw of relations) {
    const item = asObject(itemRaw);
    const remoteId = asNumber(item.id);
    const relationType = asString(item.relation_type);
    const issueToId = asNumber(item.issue_to_id);
    if (!remoteId || !relationType || !issueToId) {
      continue;
    }

    seenIds.push(remoteId);
    const relationAt = asDate(item.updated_on) ?? asDate(item.created_on) ?? new Date();
    await prisma.issueRelation.upsert({
      where: { issueId_redmineRelationId: { issueId, redmineRelationId: remoteId } },
      update: {
        issueId,
        relationType,
        targetIssueId: issueToId,
        delay: asNumber(item.delay),
      },
      create: {
        redmineRelationId: remoteId,
        issueId,
        relationType,
        targetIssueId: issueToId,
        delay: asNumber(item.delay),
      },
    });
    await recordIssueActivityEvent({
      issueId,
      eventType: "relation",
      source: "redmine",
      sourceRemoteId: String(remoteId),
      eventAt: relationAt,
      summary: `${relationType} #${issueToId}`,
    });
  }

  if (!pruneMissing) return;
  if (seenIds.length === 0) {
    await prisma.issueRelation.deleteMany({ where: { issueId } });
    return;
  }
  await prisma.issueRelation.deleteMany({
    where: {
      issueId,
      redmineRelationId: { notIn: seenIds },
    },
  });
}

export async function upsertJournals(issueId: string, issueRaw: Record<string, unknown>) {
  const journals = asObject(issueRaw).journals;
  if (!Array.isArray(journals)) {
    return;
  }

  for (const journalRaw of journals) {
    const journal = asObject(journalRaw);
    const remoteId = asNumber(journal.id);
    if (!remoteId) {
      continue;
    }

    const createdOnRemote = asDate(journal.created_on) ?? new Date();
    const notes = asString(journal.notes);
    const details = Array.isArray(journal.details) ? journal.details : undefined;

    await prisma.issueJournal.upsert({
      where: { issueId_redmineJournalId: { issueId, redmineJournalId: remoteId } },
      update: {
        author: nestedName(journal.user),
        notes,
        detailsJson: details ?? undefined,
        createdOnRemote,
      },
      create: {
        redmineJournalId: remoteId,
        issueId,
        author: nestedName(journal.user),
        notes,
        detailsJson: details ?? undefined,
        createdOnRemote,
      },
    });
    await recordIssueActivityEvent({
      issueId,
      eventType: "journal",
      source: "redmine",
      sourceRemoteId: String(remoteId),
      eventAt: createdOnRemote,
      summary: notes,
    });
  }
}

export async function upsertTimeEntriesForIssue(
  userId: string,
  issueId: string,
  remoteIssueId: number,
  client: RedmineClient,
  pruneMissing: boolean,
) {
  const remoteEntries = await client.listIssueTimeEntries(remoteIssueId);
  const seenIds: number[] = [];

  for (const entryRaw of remoteEntries) {
    const entry = asObject(entryRaw);
    const remoteId = asNumber(entry.id);
    if (!remoteId) {
      continue;
    }

    seenIds.push(remoteId);
    const comments = asString(entry.comments);
    const spentOn = asDate(entry.spent_on) ?? new Date();

    await prisma.timeEntry.upsert({
      where: { issueId_redmineTimeEntryId: { issueId, redmineTimeEntryId: remoteId } },
      update: {
        issueId,
        userId,
        hours: asNumber(entry.hours) ?? 0,
        activityId: nestedId(entry.activity) ?? 0,
        activityName: nestedName(entry.activity),
        authorName: nestedName(entry.user),
        comments,
        spentOn,
      },
      create: {
        redmineTimeEntryId: remoteId,
        issueId,
        userId,
        hours: asNumber(entry.hours) ?? 0,
        activityId: nestedId(entry.activity) ?? 0,
        activityName: nestedName(entry.activity),
        authorName: nestedName(entry.user),
        comments,
        spentOn,
      },
    });
    await recordIssueActivityEvent({
      issueId,
      eventType: "time_entry",
      source: "redmine",
      sourceRemoteId: String(remoteId),
      eventAt: spentOn,
      summary: comments,
    });
  }

  if (!pruneMissing) {
    return;
  }

  if (seenIds.length === 0) {
    await prisma.timeEntry.deleteMany({
      where: { issueId, userId },
    });
    return;
  }

  await prisma.timeEntry.deleteMany({
    where: {
      issueId,
      userId,
      OR: [{ redmineTimeEntryId: null }, { redmineTimeEntryId: { notIn: seenIds } }],
    },
  });
}
