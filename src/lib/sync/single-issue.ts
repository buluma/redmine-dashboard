// Pulls one Redmine issue's full detail and writes it into the cache, then
// fans out push/Slack/webhook notifications for what changed.

import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { emitEvent } from "@/src/lib/event-bus";
import { logEvent } from "@/src/lib/log";
import { trackFailure } from "@/src/lib/telemetry";
import { RedmineClient } from "@/src/lib/redmine";
import { recomputeIssueActivityIndex } from "@/src/lib/activity-index";
import { isHybridLocalMirror } from "@/src/lib/issue-shape";
import { buildBreadcrumbChain } from "@/src/lib/sync/breadcrumbs";
import {
  upsertAttachmentsForIssue,
  upsertIssueFromRemote,
  upsertJournals,
  upsertRelationsForIssue,
  upsertTimeEntriesForIssue,
} from "@/src/lib/sync/issue-cache";

export async function syncSingleIssue(
  userId: string,
  client: RedmineClient,
  remoteIssueId: number,
  options?: {
    pruneTimeEntries?: boolean;
    pruneAttachments?: boolean;
    pruneRelations?: boolean;
    sendNotifications?: boolean;
    sendWebhooks?: boolean;
  },
) {
  // Hybrid mirror check: source:"local" rows that DO carry a real redmineIssueId
  // (recurring-tickets' auto-created tickets — see src/lib/recurring-tickets.ts)
  // are real Redmine tickets Converge also needs read-only visibility into, not
  // fully local-only ones. Sync everything from Redmine normally EXCEPT the
  // time-entry pull: upsertTimeEntriesForIssue's prune step (manual full-sync
  // only, not this 5-min poller) deletes any local TimeEntry with
  // redmineTimeEntryId: null that isn't in Redmine's list yet — which would
  // wipe WakaTime hours logged mid-week but not yet pushed by the Sunday
  // close. `source` itself is never part of upsertIssueFromRemote's update
  // payload, so it stays "local" regardless of what runs below.
  const existingLocalCheck = await prisma.issue.findFirst({
    where: {
      userId,
      redmineIssueId: remoteIssueId,
      source: "local",
    },
    select: { id: true, source: true },
  });
  // Matched by redmineIssueId: remoteIssueId, so any row found has a real
  // redmineIssueId — a match therefore means a hybrid mirror, not a
  // fully-local ticket (those have redmineIssueId: null and never match here).
  const hybridMirror = existingLocalCheck
    ? isHybridLocalMirror({ source: existingLocalCheck.source, redmineIssueId: remoteIssueId })
    : false;

  const detail = await client.getIssue(remoteIssueId, [
    "journals",
    "attachments",
    "relations",
    "allowed_statuses",
    "children",
  ]);

  // Redmine's nested `children` (above) only carries id/tracker/subject per
  // child — no status or assignee. Re-fetch children as full issue records
  // so the subtickets table can show who each one is assigned to.
  if (Array.isArray(detail.issue.children) && (detail.issue.children as unknown[]).length > 0) {
    detail.issue.children = await client.listChildIssues(remoteIssueId);
  }

  // The gr8r push (src/lib/gr8r-task-push.ts) needs who the ticket was
  // assigned to before this sync, to tell a new assignment from an ordinary
  // update. Hybrid mirrors are the user's own recurring tickets, not new work.
  const gr8rPushEnabled = Boolean(env.gr8rUrl && env.gr8rToken) && !hybridMirror;
  const previousAssignedToId = gr8rPushEnabled
    ? ((
        await prisma.issue.findUnique({
          where: {
            userId_redmineBaseUrl_redmineIssueId: {
              userId,
              redmineBaseUrl: client.normalizedBaseUrl,
              redmineIssueId: remoteIssueId,
            },
          },
          select: { assignedToId: true },
        })
      )?.assignedToId ?? null)
    : null;

  // Track changes if notifications or webhooks need to know what changed
  const trackChanges = Boolean(options?.sendNotifications || options?.sendWebhooks);
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
  if (hybridMirror) {
    logEvent("sync.hybrid_local_mirror_time_entries_skipped", {
      redmineIssueId: remoteIssueId,
      reason: "Issue is a recurring-tickets hybrid mirror — skipping time-entry pull to avoid pruning unpushed WakaTime hours",
    }, "info");
    // upsertIssueFromRemote just overwrote spentHours with Redmine's value,
    // which excludes WakaTime hours logged locally but not yet pushed to
    // Redmine (that happens at the Sunday close). Recompute it from the local
    // TimeEntry rows — the source of truth we're preserving above — so the
    // displayed total reflects all logged hours, not just what's reached
    // Redmine so far.
    const localSpent = await prisma.timeEntry.aggregate({
      where: { issueId: issue.id },
      _sum: { hours: true },
    });
    await prisma.issue.update({
      where: { id: issue.id },
      data: { spentHours: localSpent._sum.hours ?? 0 },
    });
  } else {
    await upsertTimeEntriesForIssue(
      userId,
      issue.id,
      remoteIssueId,
      client,
      Boolean(options?.pruneTimeEntries),
    );
  }
  await recomputeIssueActivityIndex(issue.id);

  // Build breadcrumbs by fetching parent chain. Skipped for hybrid mirrors:
  // it walks the parent chain with one Redmine getIssue per ancestor, no
  // caller reads breadcrumbs off this function's return (the issue detail
  // route recomputes them), and a mirror's parent chain is stable.
  const breadcrumbs = hybridMirror ? [] : await buildBreadcrumbChain(client, remoteIssueId);

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
  }

  // Send webhook notifications to external subscribers. Webhooks are their
  // own integration: a subscriber must keep getting events when Slack/push
  // notifications are switched off.
  if (options?.sendWebhooks) {
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

  // Not gated on sendNotifications: the gr8r push is its own integration and
  // must not stop when Slack notifications are switched off. Never throws.
  if (gr8rPushEnabled) {
    const { pushIssueToGr8r } = await import("@/src/lib/gr8r-task-push");
    await pushIssueToGr8r({ userId, client, issue, wasCreated: upsertResult.wasCreated, previousAssignedToId });
  }

  return {
    ...issue,
    breadcrumbs,
    wasCreated: upsertResult.wasCreated,
    notificationResult,
  };
}
