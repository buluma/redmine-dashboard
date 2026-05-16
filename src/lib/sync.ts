import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { emitEvent } from "@/src/lib/event-bus";
import { logEvent } from "@/src/lib/log";
import { trackFailure } from "@/src/lib/telemetry";
import { RedmineClient } from "@/src/lib/redmine";
import { recordIssueActivityEvent, recomputeIssueActivityIndex } from "@/src/lib/activity-index";

function asObject(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function nestedName(value: unknown): string | null {
  return asString(asObject(value).name);
}

function nestedId(value: unknown): number | null {
  return asNumber(asObject(value).id);
}

function parentIssueLabel(value: unknown): string | null {
  const obj = asObject(value);
  const subject = asString(obj.subject);
  const id = asNumber(obj.id);
  if (subject) {
    return subject;
  }
  if (id) {
    return `#${id}`;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  const s = asString(value);
  if (!s) {
    return null;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

type AllowedStatus = { id: number; name: string; isClosed?: boolean };

function parseAllowedStatuses(issueRaw: Record<string, unknown>): AllowedStatus[] {
  const statuses = asObject(issueRaw).allowed_statuses;
  if (!Array.isArray(statuses)) {
    return [];
  }

  return statuses
    .map((row) => {
      const item = asObject(row);
      const id = asNumber(item.id);
      const name = asString(item.name);
      if (!id || !name) return null;
      return {
        id,
        name,
        ...(asBoolean(item.is_closed) !== null ? { isClosed: asBoolean(item.is_closed) ?? undefined } : {}),
      };
    })
    .filter((x): x is AllowedStatus => Boolean(x));
}

type IssueChild = {
  id: number;
  subject: string;
  tracker?: string;
};

function parseChildren(issueRaw: Record<string, unknown>): IssueChild[] {
  const children = asObject(issueRaw).children;
  if (!Array.isArray(children)) {
    return [];
  }

  const result: IssueChild[] = [];
  for (const row of children) {
    const item = asObject(row);
    const id = asNumber(item.id);
    const subject = asString(item.subject);
    if (!id || !subject) continue;

    const trackerObj = item.tracker as Record<string, unknown> | undefined;
    const trackerName = trackerObj ? asString(trackerObj.name) : null;
    const tracker = trackerName ?? undefined;

    result.push({ id, subject, tracker });
  }
  return result;
}

async function upsertIssueFromRemote(
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

async function upsertRelationsForIssue(issueId: string, issueRaw: Record<string, unknown>, pruneMissing: boolean) {
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

async function upsertJournals(issueId: string, issueRaw: Record<string, unknown>) {
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

async function upsertTimeEntriesForIssue(
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

export async function syncStatusCatalog(client: RedmineClient): Promise<void> {
  const statuses = await client.getIssueStatuses();
  for (const status of statuses) {
    await prisma.statusCatalog.upsert({
      where: { id: status.id },
      update: {
        name: status.name,
        isClosed: Boolean(status.is_closed),
      },
      create: {
        id: status.id,
        name: status.name,
        isClosed: Boolean(status.is_closed),
      },
    });
  }
}

export async function syncEnumerationCatalog(client: RedmineClient): Promise<void> {
  const [activities, priorities] = await Promise.all([
    client.getTimeEntryActivities(),
    client.getIssuePriorities(),
  ]);

  for (const activity of activities) {
    await prisma.enumerationCatalog.upsert({
      where: { key: `time_entry_activity:${activity.id}` },
      update: {
        remoteId: activity.id,
        kind: "time_entry_activity",
        name: activity.name,
        isDefault: false,
        isActive: true,
        position: null,
      },
      create: {
        key: `time_entry_activity:${activity.id}`,
        remoteId: activity.id,
        kind: "time_entry_activity",
        name: activity.name,
        isDefault: false,
        isActive: true,
        position: null,
      },
    });
  }

  for (const priority of priorities) {
    await prisma.enumerationCatalog.upsert({
      where: { key: `issue_priority:${priority.id}` },
      update: {
        remoteId: priority.id,
        kind: "issue_priority",
        name: priority.name,
        isDefault: Boolean(priority.is_default),
        isActive: priority.active ?? true,
        position: priority.position ?? null,
      },
      create: {
        key: `issue_priority:${priority.id}`,
        remoteId: priority.id,
        kind: "issue_priority",
        name: priority.name,
        isDefault: Boolean(priority.is_default),
        isActive: priority.active ?? true,
        position: priority.position ?? null,
      },
    });
  }
}

export async function syncSingleIssue(
  userId: string,
  client: RedmineClient,
  remoteIssueId: number,
  options?: {
    pruneTimeEntries?: boolean;
    pruneAttachments?: boolean;
    pruneRelations?: boolean;
    sendNotifications?: boolean;
  },
) {
  // Guard: check if issue is local-only — skip sync entirely
  const existingLocalCheck = await prisma.issue.findFirst({
    where: {
      userId,
      redmineIssueId: remoteIssueId,
      source: "local",
    },
    select: { id: true, source: true },
  });
  if (existingLocalCheck?.source === "local") {
    logEvent("sync.local_issue_skipped", {
      redmineIssueId: remoteIssueId,
      reason: "Issue marked as local-only, skipping sync to prevent Redmine overwrite",
    }, "warn");
    return null;
  }

  const detail = await client.getIssue(remoteIssueId, [
    "journals",
    "attachments",
    "relations",
    "allowed_statuses",
    "children",
  ]);
  
  // Track changes if notifications are enabled
  const trackChanges = options?.sendNotifications ?? false;
  const upsertResult = await upsertIssueFromRemote(
    userId,
    client.normalizedBaseUrl,
    detail.issue,
    trackChanges
  );
  const issue = upsertResult.issue;

  if (typeof issue.redmineIssueId === "number" && issue.redmineIssueId > 0) {
    if (upsertResult.wasCreated) {
      emitEvent({
        type: "issue.created",
        userId,
        redmineIssueId: issue.redmineIssueId,
        issueId: issue.id,
      });
    } else {
      const oldState = upsertResult.oldState;
      const changes: { statusName?: { from: string | null; to: string | null }; priorityName?: { from: string | null; to: string | null } } = {};
      if (oldState && oldState.statusName !== issue.statusName) {
        changes.statusName = { from: oldState.statusName, to: issue.statusName };
      }
      if (oldState && oldState.priorityName !== issue.priority) {
        changes.priorityName = { from: oldState.priorityName, to: issue.priority };
      }
      emitEvent({
        type: "issue.updated",
        userId,
        redmineIssueId: issue.redmineIssueId,
        issueId: issue.id,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      });
    }
  }

  await upsertJournals(issue.id, detail.issue);
  await upsertAttachmentsForIssue(issue.id, detail.issue, options?.pruneAttachments ?? true);
  await upsertRelationsForIssue(issue.id, detail.issue, options?.pruneRelations ?? true);
  await upsertTimeEntriesForIssue(
    userId,
    issue.id,
    remoteIssueId,
    client,
    Boolean(options?.pruneTimeEntries),
  );
  await recomputeIssueActivityIndex(issue.id);

  // Build breadcrumbs by fetching parent chain
  const breadcrumbs = await buildBreadcrumbChain(client, remoteIssueId);

  // Send PWA Push notifications
  let notificationResult = null;
  if (options?.sendNotifications) {
    try {
      const { sendPushNotification } = await import("@/src/lib/push");
      
      if (upsertResult.wasCreated) {
        await sendPushNotification(userId, {
          title: "New Issue Assigned",
          body: `[#${issue.redmineIssueId}] ${issue.subject} in ${issue.projectName}`,
          data: { url: `/issues/${issue.id}` },
        });
      } else if (upsertResult.oldState) {
        const statusChanged = upsertResult.oldState.statusName !== issue.statusName;
        const priorityImportant = (issue.priority || "").toLowerCase().includes("high") || (issue.priority || "").toLowerCase().includes("urgent");
        const priorityChanged = upsertResult.oldState.priorityName !== issue.priority;

        if (statusChanged || (priorityChanged && priorityImportant)) {
          await sendPushNotification(userId, {
            title: `Issue Update: #${issue.redmineIssueId}`,
            body: statusChanged 
              ? `Status changed from ${upsertResult.oldState.statusName} to ${issue.statusName}`
              : `Priority updated to ${issue.priority}: ${issue.subject}`,
            data: { url: `/issues/${issue.id}` },
          });
        }
      }
    } catch (pushError) {
      trackFailure({ event: "sync.push.failed", error: pushError, metricName: "sync_push_failed" });
    }

    // Send Slack notification if enabled
    try {
      const { getSlackNotificationService } = await import("@/src/lib/slack-notification-service");
      const service = getSlackNotificationService();
      
      // Build oldState from upsertResult if this was an update
      let oldStateForNotification = null;
      if (!upsertResult.wasCreated && upsertResult.oldState) {
        oldStateForNotification = {
          id: issue.id,
          redmineIssueId: issue.redmineIssueId,
          subject: upsertResult.oldState.subject,
          projectName: issue.projectName,
          statusName: upsertResult.oldState.statusName,
          priorityName: upsertResult.oldState.priorityName,
          assignedToName: upsertResult.oldState.assignedToName,
          updatedAt: issue.updatedAt?.toISOString() || new Date().toISOString(),
          dueDate: upsertResult.oldState.dueDate?.toISOString() || null,
          doneRatio: upsertResult.oldState.doneRatio,
        };
      }
      
      const newState = service.toIssueState(issue);
      notificationResult = await service.notifyIssueChanges(oldStateForNotification, newState);
    } catch (notifyError) {
      logEvent("sync.notification.error", {
        issueId: issue.redmineIssueId,
        error: notifyError instanceof Error ? notifyError.message : "Unknown error",
      }, "error");
    }

    // Send webhook notifications to external subscribers
    try {
      const { dispatchWebhook } = await import("@/src/lib/webhook-subscription");

      // Build ticket payload
      const ticketPayload = {
        id: issue.id,
        redmineIssueId: issue.redmineIssueId,
        subject: issue.subject,
        description: issue.description,
        projectName: issue.projectName,
        trackerName: issue.tracker,
        statusName: issue.statusName,
        priorityName: issue.priority,
        assignedToId: issue.assignedToId?.toString() ?? null,
        assignedToName: issue.assignedToName,
        authorId: issue.authorId?.toString() ?? null,
        authorName: issue.authorName,
        dueDate: issue.dueDate?.toISOString() || null,
        doneRatio: issue.doneRatio,
        createdAt: issue.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: issue.updatedAt?.toISOString() || new Date().toISOString(),
      };

      if (upsertResult.wasCreated) {
        // New ticket created
        await dispatchWebhook("ticket.created", ticketPayload, undefined, userId);
      } else if (upsertResult.oldState) {
        // Detect what changed
        const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

        if (upsertResult.oldState.statusName !== issue.statusName) {
          changes.push({
            field: "status",
            oldValue: upsertResult.oldState.statusName,
            newValue: issue.statusName,
          });
        }
        if (upsertResult.oldState.assignedToName !== issue.assignedToName) {
          changes.push({
            field: "assigned_to",
            oldValue: upsertResult.oldState.assignedToName,
            newValue: issue.assignedToName,
          });
        }
        if (upsertResult.oldState.priorityName !== issue.priority) {
          changes.push({
            field: "priority",
            oldValue: upsertResult.oldState.priorityName,
            newValue: issue.priority,
          });
        }
        if (upsertResult.oldState.dueDate?.toISOString() !== issue.dueDate?.toISOString()) {
          changes.push({
            field: "due_date",
            oldValue: upsertResult.oldState.dueDate?.toISOString() || null,
            newValue: issue.dueDate?.toISOString() || null,
          });
        }
        if (upsertResult.oldState.subject !== issue.subject) {
          changes.push({
            field: "subject",
            oldValue: upsertResult.oldState.subject,
            newValue: issue.subject,
          });
        }

        // Determine event type based on changes
        const statusChanged = changes.some(c => c.field === "status");
        const assignedChanged = changes.some(c => c.field === "assigned_to");

        if (statusChanged && issue.statusName === "Completed") {
          await dispatchWebhook("ticket.completed", ticketPayload, changes, userId);
        } else if (statusChanged) {
          await dispatchWebhook("ticket.status_changed", ticketPayload, changes, userId);
        } else if (assignedChanged) {
          await dispatchWebhook("ticket.assigned", ticketPayload, changes, userId);
        } else if (changes.length > 0) {
          await dispatchWebhook("ticket.updated", ticketPayload, changes, userId);
        }
      }
    } catch (webhookError) {
      logEvent("sync.webhook.error", {
        issueId: issue.redmineIssueId,
        error: webhookError instanceof Error ? webhookError.message : "Unknown error",
      }, "warn");
    }
  }

  return { 
    ...issue, 
    breadcrumbs,
    wasCreated: upsertResult.wasCreated,
    notificationResult,
  };
}

export async function buildBreadcrumbChain(
  client: RedmineClient,
  issueId: number,
  maxDepth: number = 20,
): Promise<Array<{ id: number; subject: string; tracker?: string }>> {
  const chain: Array<{ id: number; subject: string; tracker?: string }> = [];
  let currentId: number | null = issueId;
  let depth = 0;
  const visited = new Set<number>();

  while (currentId && depth < maxDepth && !visited.has(currentId)) {
    visited.add(currentId);
    try {
      const data = await client.getIssue(currentId, ["parent"]);
      const issue = asObject(data?.issue);
      const currentIssueId = asNumber(issue.id);
      if (!currentIssueId) break;

      chain.unshift({
        id: currentIssueId,
        subject: asString(issue.subject) ?? `Issue #${currentIssueId}`,
        tracker: nestedName(issue.tracker) ?? undefined,
      });

      const parentId = nestedId(issue.parent);
      currentId = parentId ? Number(parentId) : null;
      if (!currentId || !Number.isInteger(currentId) || currentId <= 0) break;

      depth++;
    } catch {
      break;
    }
  }

  return chain;
}

async function markSyncState(
  userId: string,
  input: {
    status: "idle" | "running" | "success" | "failed";
    runningJobId?: string | null;
    error?: string | null;
    full?: boolean;
    incremental?: boolean;
  },
) {
  const now = new Date();
  await prisma.syncState.upsert({
    where: { userId },
    update: {
      lastSyncStatus: input.status,
      runningJobId: input.runningJobId ?? null,
      lastError: input.error ?? null,
      lastFullSyncAt: input.full ? now : undefined,
      lastIncrementalSyncAt: input.incremental ? now : undefined,
    },
    create: {
      userId,
      lastSyncStatus: input.status,
      runningJobId: input.runningJobId ?? null,
      lastError: input.error ?? null,
      lastFullSyncAt: input.full ? now : null,
      lastIncrementalSyncAt: input.incremental ? now : null,
    },
  });
}

export async function runSyncJob(
  userId: string,
  jobType: "incremental" | "full_manual",
): Promise<{ jobId: string }> {
  const now = new Date();
  const existing = await prisma.syncJob.findFirst({
    where: {
      userId,
      status: { in: ["pending", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // Only stale-reset "pending" jobs — a "running" job is actively executing,
    // even if it takes longer than the stale threshold.
    if (existing.status === "pending") {
      const ageMs = now.getTime() - existing.createdAt.getTime();
      if (ageMs < env.syncJobStaleMs) {
        logEvent("sync.job.reuse_existing", {
          userId,
          jobType,
          existingJobId: existing.id,
          existingStatus: existing.status,
        });
        return { jobId: existing.id };
      }

      const staleMessage = `Sync job was pending for ${Math.round(ageMs / 1000)}s and was reset automatically`;
      await prisma.syncJob.update({
        where: { id: existing.id },
        data: {
          status: "failed",
          endedAt: now,
          error: staleMessage,
        },
      });

      await markSyncState(userId, {
        status: "failed",
        runningJobId: null,
        error: staleMessage,
        full: false,
        incremental: false,
      });
      logEvent("sync.job.stale_reset", {
        userId,
        staleJobId: existing.id,
        staleAgeMs: ageMs,
        staleMessage,
      }, "warn");
    } else {
      // Job is already running — reuse it regardless of duration.
      logEvent("sync.job.reuse_existing", {
        userId,
        jobType,
        existingJobId: existing.id,
        existingStatus: existing.status,
      });
      return { jobId: existing.id };
    }
  }

  const job = await prisma.syncJob.create({
    data: {
      userId,
      jobType,
      status: "pending",
    },
  });

  void executeSyncJob(job.id);
  logEvent("sync.job.created", { userId, jobType, jobId: job.id });
  return { jobId: job.id };
}

export async function executeSyncJob(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") {
    return;
  }

  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: new Date(),
    },
  });

  await markSyncState(job.userId, { status: "running", runningJobId: jobId, error: null });
  logEvent("sync.job.started", {
    jobId,
    userId: job.userId,
    jobType: job.jobType,
  });

  try {
    const cred = await prisma.userRedmineCredential.findUnique({ where: { userId: job.userId } });
    if (!cred || !cred.isActive) {
      throw new Error("User has no active Redmine credential");
    }

    const { decryptText } = await import("@/src/lib/crypto");
    const client = new RedmineClient(cred.baseUrl, decryptText(cred.apiKeyEncrypted, cred.apiKeyIv));

    await syncStatusCatalog(client);
    await syncEnumerationCatalog(client);

    const syncState = await prisma.syncState.findUnique({ where: { userId: job.userId } });

    // Determine the date filter for fetching issues:
    // - incremental: uses lastIncrementalSyncAt from SyncState
    // - full_manual: fetches only issues updated in the last 24 hours
    //   to avoid expensive full-table scans on large Redmine instances
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const incrementalSince =
      job.jobType === "incremental"
        ? (syncState?.lastIncrementalSyncAt ?? undefined)
        : job.jobType === "full_manual"
          ? twentyFourHoursAgo
          : undefined;

    const issueList = await client.listIssues(env.redmineSyncIssueScope, incrementalSince);
    const seenRemoteIssueIds = new Set<number>();

    for (const issueRaw of issueList) {
      const remoteId = asNumber(asObject(issueRaw).id);
      if (!remoteId) {
        continue;
      }
      seenRemoteIssueIds.add(remoteId);

      await syncSingleIssue(job.userId, client, remoteId, {
        pruneTimeEntries: job.jobType === "full_manual",
        pruneAttachments: true,
        pruneRelations: true,
        sendNotifications: env.slackNotifyEnabled,
      });
    }

    // SAFETY: Do NOT delete issues that weren't seen during sync.
    // The sync may not fetch ALL issues (pagination limits, rate limiting,
    // interrupted jobs, or scoped queries like assigned/open).
    // Deleting unseen issues would cause data loss.
    // if (job.jobType === "full_manual") {
    //   await prisma.issue.deleteMany({
    //     where: {
    //       userId: job.userId,
    //       redmineBaseUrl: client.normalizedBaseUrl,
    //       redmineIssueId: { notIn: Array.from(seenRemoteIssueIds) },
    //     },
    //   });
    // }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        endedAt: new Date(),
      },
    });

    await markSyncState(job.userId, {
      status: "success",
      runningJobId: null,
      error: null,
      full: job.jobType === "full_manual",
      incremental: job.jobType === "incremental",
    });
    logEvent("sync.job.succeeded", {
      jobId,
      userId: job.userId,
      jobType: job.jobType,
      syncedIssueCount: seenRemoteIssueIds.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        endedAt: new Date(),
        error: message,
      },
    });

    await markSyncState(job.userId, {
      status: "failed",
      runningJobId: null,
      error: message,
      full: false,
      incremental: false,
    });
    logEvent("sync.job.failed", {
      jobId,
      userId: job.userId,
      jobType: job.jobType,
      error: message,
    }, "error");
  }
}
