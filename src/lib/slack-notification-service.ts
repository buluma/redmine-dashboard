import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import { prisma } from "@/src/lib/db";
import { SlackNotifier, IssueUpdate, IssueChange, SlackNotifierConfig } from "@/src/lib/slack-notifier";
import type { Issue } from "@prisma/client";

export interface IssueState {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  projectName: string | null;
  statusName: string;
  priorityName: string | null;
  assignedToName: string | null;
  updatedAt: string;
  doneRatio: number | null;
  dueDate: string | null;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
}

/**
 * SlackNotificationService
 * 
 * Handles sending Slack notifications for Redmine issue changes.
 * Can be used in three ways:
 * 1. Integrated into sync workflow (automatic)
 * 2. Called directly via API (webhook)
 * 3. Called programmatically from any code
 */
export class SlackNotificationService {
  private notifier: SlackNotifier | null = null;
  private config: SlackNotifierConfig | null = null;
  private initialized = false;

  /**
   * Initialize the notifier if Slack is configured and enabled
   */
  private initialize(): boolean {
    if (this.initialized) {
      return this.config !== null;
    }

    this.initialized = true;

    if (!env.slackBotToken) {
      logEvent("slack.notifier.skipped", { reason: "no_bot_token" }, "warn");
      return false;
    }

    const channelId = env.slackNotifyChannelId || env.slackDefaultChannelId;
    if (!channelId) {
      logEvent("slack.notifier.skipped", { reason: "no_channel_id" }, "warn");
      return false;
    }

    if (!env.slackNotifyEnabled) {
      // Don't log when disabled - this is expected behavior
      return false;
    }

    this.config = SlackNotifier.createDefaultConfig(channelId, env.redmineBaseUrl || "", {
      enabled: env.slackNotifyEnabled,
      notifyOnCreate: env.slackNotifyOnCreate,
      notifyOnUpdate: env.slackNotifyOnUpdate,
      notifyOnStatusChange: env.slackNotifyOnStatusChange,
      notifyOnAssignment: env.slackNotifyOnAssignment,
      notifyOnInternalNote: env.slackNotifyOnInternalNote,
      format: env.slackNotifyFormat,
      includeLink: true,
    });

    this.notifier = new SlackNotifier(env.slackBotToken, this.config);

    logEvent("slack.notifier.initialized", {
      channelId,
      enabled: env.slackNotifyEnabled,
    });

    return true;
  }

  /**
   * Convert a Prisma Issue to IssueState
   */
  toIssueState(issue: Issue): IssueState {
    return {
      id: issue.id,
      redmineIssueId: issue.redmineIssueId,
      subject: issue.subject,
      projectName: issue.projectName,
      statusName: issue.statusName,
      priorityName: issue.priority,  // priority field maps to priorityName in state
      assignedToName: issue.assignedToName,
      updatedAt: issue.updatedAt?.toISOString() || new Date().toISOString(),
      doneRatio: issue.doneRatio,
      dueDate: issue.dueDate?.toISOString() || null,
    };
  }

  /**
   * Convert IssueState to IssueUpdate for the notifier
   */
  private toIssueUpdate(state: IssueState): IssueUpdate {
    return {
      id: state.id,
      redmineIssueId: state.redmineIssueId,
      subject: state.subject,
      projectName: state.projectName,
      statusName: state.statusName,
      priorityName: state.priorityName,
      assignedToName: state.assignedToName,
      updatedAt: state.updatedAt,
    };
  }

  /**
   * Detect changes between old and new state
   */
  detectChanges(oldState: IssueState | null, newState: IssueState): IssueChange[] {
    const changes: IssueChange[] = [];

    if (!oldState) {
      return changes; // This is a create, handled separately
    }

    // Status change
    if (oldState.statusName !== newState.statusName) {
      changes.push({
        field: "status",
        oldValue: oldState.statusName,
        newValue: newState.statusName,
      });
    }

    // Priority change
    if (oldState.priorityName !== newState.priorityName) {
      changes.push({
        field: "priority",
        oldValue: oldState.priorityName,
        newValue: newState.priorityName,
      });
    }

    // Assignment change
    if (oldState.assignedToName !== newState.assignedToName) {
      changes.push({
        field: "assigned_to",
        oldValue: oldState.assignedToName,
        newValue: newState.assignedToName,
      });
    }

    // Subject change
    if (oldState.subject !== newState.subject) {
      changes.push({
        field: "subject",
        oldValue: oldState.subject,
        newValue: newState.subject,
      });
    }

    // Due date change
    if (oldState.dueDate !== newState.dueDate) {
      changes.push({
        field: "due_date",
        oldValue: oldState.dueDate,
        newValue: newState.dueDate,
      });
    }

    // Done ratio change
    if (oldState.doneRatio !== newState.doneRatio) {
      changes.push({
        field: "done_ratio",
        oldValue: oldState.doneRatio?.toString() ?? null,
        newValue: newState.doneRatio?.toString() ?? null,
      });
    }

    return changes;
  }

  /**
   * Check if the issue was just closed
   */
  isClosedTransition(oldState: IssueState | null, newState: IssueState): boolean {
    if (!oldState) return false;
    
    const closedKeywords = ["closed", "resolved", "done", "completed", "finished"];
    const wasOpen = !closedKeywords.some(k => 
      oldState.statusName.toLowerCase().includes(k)
    );
    const isNowClosed = closedKeywords.some(k => 
      newState.statusName.toLowerCase().includes(k)
    );
    
    return wasOpen && isNowClosed;
  }

  /**
   * Send notifications for issue changes
   */
  async notifyIssueChanges(
    oldState: IssueState | null,
    newState: IssueState
  ): Promise<NotificationResult> {
    if (!this.initialize()) {
      return { success: true }; // Not configured, not an error
    }

    try {
      const issueUpdate = this.toIssueUpdate(newState);
      const changes = this.detectChanges(oldState, newState);
      const isNew = oldState === null;

      // Check for closed transition
      const isClosed = this.isClosedTransition(oldState, newState);

      // Send appropriate notification
      if (isNew && this.config!.notifyOnCreate) {
        await this.notifier!.notifyIssueCreated(issueUpdate);
        logEvent("slack.notification.sent", {
          type: "create",
          issueId: newState.redmineIssueId,
        });
      } else if (isClosed) {
        await this.notifier!.notifyIssueClosed(issueUpdate);
        logEvent("slack.notification.sent", {
          type: "closed",
          issueId: newState.redmineIssueId,
        });
      } else if (changes.length > 0) {
        // Check if the most significant change was assignment
        const assignmentChange = changes.find(c => c.field === "assigned_to");
        if (assignmentChange && this.config!.notifyOnAssignment) {
          await this.notifier!.notifyIssueAssigned(
            issueUpdate,
            assignmentChange.oldValue
          );
          logEvent("slack.notification.sent", {
            type: "assignment",
            issueId: newState.redmineIssueId,
          });
        } else if (this.config!.notifyOnUpdate || this.config!.notifyOnStatusChange) {
          // Filter changes based on config
          const relevantChanges = changes.filter(c => {
            if (c.field === "status" && !this.config!.notifyOnStatusChange) return false;
            if (c.field === "assigned_to" && !this.config!.notifyOnAssignment) return false;
            return true;
          });

          if (relevantChanges.length > 0) {
            await this.notifier!.notifyIssueUpdated(issueUpdate, relevantChanges);
            logEvent("slack.notification.sent", {
              type: "update",
              issueId: newState.redmineIssueId,
              changes: relevantChanges.map(c => c.field),
            });
          }
        }
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logEvent("slack.notification.failed", {
        error: message,
        issueId: newState.redmineIssueId,
      }, "error");
      return { success: false, error: message };
    }
  }

  /**
   * Send a test notification
   */
  async testNotification(): Promise<NotificationResult> {
    if (!this.initialize()) {
      return { 
        success: false, 
        error: "Slack notifier not configured. Check SLACK_BOT_TOKEN and SLACK_NOTIFY_ENABLED." 
      };
    }

    try {
      const success = await this.notifier!.testNotification();
      if (success) {
        logEvent("slack.test_notification.sent", {});
        return { success: true };
      } else {
        return { success: false, error: "Failed to send test notification" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logEvent("slack.test_notification.failed", { error: message }, "error");
      return { success: false, error: message };
    }
  }

  /**
   * Send a sync summary notification
   */
  async notifySyncSummary(stats: {
    created: number;
    updated: number;
    closed: number;
    errors: number;
  }): Promise<NotificationResult> {
    if (!this.initialize()) {
      return { success: true };
    }

    try {
      await this.notifier!.notifySyncSummary(stats);
      logEvent("slack.notification.sent", { type: "sync_summary", stats });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  /**
   * Send notification when an internal note is added
   */
  async notifyInternalNoteAdded(
    issueId: string,
    noteContent: string,
    authorName: string
  ): Promise<NotificationResult> {
    logEvent("slack.internal_note.starting", { issueId, authorName });
    
    if (!this.initialize()) {
      logEvent("slack.internal_note.skipped", { reason: "not_initialized" });
      return { success: false, error: "Slack notifier not initialized" };
    }

    try {
      const issue = await prisma.issue.findUnique({
        where: { id: issueId },
      });

      if (!issue) {
        logEvent("slack.internal_note.failed", { reason: "issue_not_found", issueId });
        return { success: false, error: "Issue not found" };
      }

      logEvent("slack.internal_note.sending", { 
        issueId, 
        redmineIssueId: issue.redmineIssueId,
        subject: issue.subject 
      });

      const issueUpdate = this.toIssueUpdate(this.toIssueState(issue));
      
      // Build dashboard URL for local issues
      const dashboardUrl = !issue.redmineIssueId 
        ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/issues/${issue.id}`
        : undefined;
      
      await this.notifier!.notifyInternalNoteAdded(issueUpdate, noteContent, authorName, {
        priority: issue.priority,
        status: issue.statusName,
        assignee: issue.assignedToName,
        dueDate: issue.dueDate 
          ? new Date(issue.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : undefined,
        dashboardUrl,
      });
      
      logEvent("slack.notification.sent", {
        type: "internal_note",
        issueId: issue.redmineIssueId,
      });
      
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logEvent("slack.notification.failed", {
        error: message,
        issueId,
      }, "error");
      return { success: false, error: message };
    }
  }
}

// Singleton instance for easy use
let notificationService: SlackNotificationService | null = null;

export function getSlackNotificationService(): SlackNotificationService {
  if (!notificationService) {
    notificationService = new SlackNotificationService();
  }
  return notificationService;
}
