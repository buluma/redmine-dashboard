import { WebClient, Block, KnownBlock } from "@slack/web-api";

export interface SlackNotifierConfig {
  enabled: boolean;
  channelId: string;
  notifyOnCreate: boolean;
  notifyOnUpdate: boolean;
  notifyOnStatusChange: boolean;
  notifyOnAssignment: boolean;
  notifyOnInternalNote: boolean;
  format: "compact" | "detailed";
  includeLink: boolean;
  redmineBaseUrl: string;
}

export interface IssueUpdate {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  projectName: string | null;
  statusName: string;
  priorityName: string | null;
  assignedToName: string | null;
  updatedAt: string;
}

export interface IssueChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export class SlackNotifier {
  private client: WebClient;
  private config: SlackNotifierConfig;

  constructor(botToken: string, config: SlackNotifierConfig) {
    this.client = new WebClient(botToken);
    this.config = config;
  }

  static createDefaultConfig(
    channelId: string,
    redmineBaseUrl: string,
    overrides?: Partial<SlackNotifierConfig>
  ): SlackNotifierConfig {
    return {
      enabled: true,
      channelId,
      notifyOnCreate: true,
      notifyOnUpdate: true,
      notifyOnStatusChange: true,
      notifyOnAssignment: true,
      notifyOnInternalNote: true,
      format: "compact",
      includeLink: true,
      redmineBaseUrl,
      ...overrides,
    };
  }

  private async sendMessage(blocks: (Block | KnownBlock)[]): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await this.client.chat.postMessage({
        channel: this.config.channelId,
        blocks,
        unfurl_links: false,
      });
    } catch (error) {
      console.error("Failed to send Slack notification:", error);
      throw error;
    }
  }

  private buildIssueLink(redmineIssueId: number | null): string {
    // No link for local issues (redmineIssueId is null)
    if (!redmineIssueId) return "";
    if (!this.config.includeLink || !this.config.redmineBaseUrl) {
      return "";
    }
    return `${this.config.redmineBaseUrl}/issues/${redmineIssueId}`;
  }

  private formatFieldChange(change: IssueChange): string {
    const oldVal = change.oldValue || "(none)";
    const newVal = change.newValue || "(none)";
    return `• *${this.formatFieldName(change.field)}*: ${oldVal} → ${newVal}`;
  }

  private formatFieldName(field: string): string {
    const names: Record<string, string> = {
      status: "Status",
      priority: "Priority",
      assigned_to: "Assigned to",
      subject: "Subject",
      description: "Description",
      due_date: "Due date",
      done_ratio: "Progress",
    };
    return names[field] || field.replace(/_/g, " ");
  }

  async notifyIssueCreated(issue: IssueUpdate): Promise<void> {
    if (!this.config.notifyOnCreate) return;

    const link = this.buildIssueLink(issue.redmineIssueId);
    const projectInfo = issue.projectName ? `[${issue.projectName}]` : "";

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: issue.redmineIssueId 
            ? `✨ New Issue #${issue.redmineIssueId}: ${issue.subject}` 
            : `✨ New Issue: ${issue.subject}`,
          emoji: true,
        },
      },
    ];

    if (issue.assignedToName) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `👤 *Assigned to:* ${issue.assignedToName}`,
        },
      });
    }

    blocks.push(
      { type: "divider" } as Block,
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: [
              projectInfo,
              issue.statusName ? `📋 ${issue.statusName}` : null,
              issue.priorityName ? `🔺 ${issue.priorityName}` : null,
              issue.assignedToName ? `👤 ${issue.assignedToName}` : null,
              this.formatTimestamp(issue.updatedAt),
              link ? `<${link}|View in Redmine>` : null,
            ].filter(Boolean).join(" · "),
          },
        ],
      },
    );

    await this.sendMessage(blocks);
  }

  async notifyIssueUpdated(
    issue: IssueUpdate,
    changes: IssueChange[]
  ): Promise<void> {
    // Filter changes based on config
    const relevantChanges = changes.filter((change) => {
      if (change.field === "status" && !this.config.notifyOnStatusChange) return false;
      if (change.field === "assigned_to" && !this.config.notifyOnAssignment) return false;
      return true;
    });

    if (relevantChanges.length === 0) return;

    const link = this.buildIssueLink(issue.redmineIssueId);
    const projectInfo = issue.projectName ? `[${issue.projectName}]` : "";

    const changesText = relevantChanges
      .map((c) => this.formatFieldChange(c))
      .join("\n");

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: issue.redmineIssueId 
            ? `✏️ Issue #${issue.redmineIssueId}: ${issue.subject}` 
            : `✏️ Issue: ${issue.subject}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: changesText,
        },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: [
              projectInfo,
              issue.statusName ? `📋 ${issue.statusName}` : null,
              issue.priorityName ? `🔺 ${issue.priorityName}` : null,
              issue.assignedToName ? `👤 ${issue.assignedToName}` : null,
              link ? `<${link}|View in Redmine>` : null,
            ].filter(Boolean).join(" · "),
          },
        ],
      },
    ];

    await this.sendMessage(blocks);
  }

  async notifyIssueClosed(issue: IssueUpdate): Promise<void> {
    const link = this.buildIssueLink(issue.redmineIssueId);
    const projectInfo = issue.projectName ? `[${issue.projectName}]` : "";

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: issue.redmineIssueId 
            ? `✅ Issue #${issue.redmineIssueId}: ${issue.subject}` 
            : `✅ Issue: ${issue.subject}`,
          emoji: true,
        },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: [
              projectInfo,
              `🏁 Closed`,
              issue.assignedToName ? `👤 Was: ${issue.assignedToName}` : null,
              this.formatTimestamp(issue.updatedAt),
              link ? `<${link}|View in Redmine>` : null,
            ].filter(Boolean).join(" · "),
          },
        ],
      },
    ];

    await this.sendMessage(blocks);
  }

  async notifyIssueAssigned(issue: IssueUpdate, previousAssignee: string | null): Promise<void> {
    if (!this.config.notifyOnAssignment) return;

    const link = this.buildIssueLink(issue.redmineIssueId);
    const projectInfo = issue.projectName ? `[${issue.projectName}]` : "";

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: issue.redmineIssueId 
            ? `👤 Issue #${issue.redmineIssueId}: ${issue.subject}` 
            : `👤 Issue: ${issue.subject}`,
          emoji: true,
        },
      },
    ];

    // Show assignment change
    if (previousAssignee || issue.assignedToName) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${previousAssignee || "Nobody"} → *${issue.assignedToName || "Unassigned"}*`,
        },
      });
    }

    blocks.push(
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: [
              projectInfo,
              issue.statusName ? `📋 ${issue.statusName}` : null,
              issue.priorityName ? `🔺 ${issue.priorityName}` : null,
              link ? `<${link}|View in Redmine>` : null,
            ].filter(Boolean).join(" · "),
          },
        ],
      },
    );

    await this.sendMessage(blocks);
  }

  async notifyInternalNoteAdded(
    issue: IssueUpdate,
    noteContent: string,
    authorName: string,
    extra?: {
      priority?: string | null;
      status?: string;
      assignee?: string | null;
      dueDate?: string | null;
      dashboardUrl?: string;
    }
  ): Promise<void> {
    if (!this.config.notifyOnInternalNote) return;

    const link = this.buildIssueLink(issue.redmineIssueId);
    const projectInfo = issue.projectName ? `[${issue.projectName}]` : "";
    const truncatedNote = noteContent.length > 500 
      ? noteContent.slice(0, 500) + "…"
      : noteContent;

    // Build context line
    const contextParts: string[] = [];
    if (projectInfo) contextParts.push(projectInfo);
    if (extra?.status) contextParts.push(`📋 ${extra.status}`);
    if (extra?.priority) contextParts.push(`🔺 ${extra.priority}`);
    if (extra?.assignee) contextParts.push(`👤 ${extra.assignee}`);
    if (extra?.dueDate) contextParts.push(`📅 ${extra.dueDate}`);
    contextParts.push(`✍️ *${authorName}*`);
    if (link) contextParts.push(`<${link}|View in Redmine>`);
    else if (extra?.dashboardUrl) contextParts.push(`<${extra.dashboardUrl}|View in Dashboard>`);

    const blocks: (Block | KnownBlock)[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: issue.redmineIssueId 
            ? `💬 Note on #${issue.redmineIssueId}: ${issue.subject}` 
            : `💬 Note: ${issue.subject}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `> ${truncatedNote.replace(/\n/g, "\n> ")}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: contextParts.map((text) => ({ type: "mrkdwn" as const, text })),
      },
    ];

    await this.sendMessage(blocks);
  }

  async notifySyncSummary(stats: {
    created: number;
    updated: number;
    closed: number;
    errors: number;
  }): Promise<void> {
    const { created, updated, closed, errors } = stats;
    const total = created + updated + closed;

    if (total === 0 && errors === 0) return;

    const emoji = errors > 0 ? "⚠️" : "🔄";
    const errorsText = errors > 0 ? ` · ${errors} error${errors > 1 ? "s" : ""}` : "";

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *Sync Complete*\n${created > 0 ? `• ${created} created\n` : ""}${updated > 0 ? `• ${updated} updated\n` : ""}${closed > 0 ? `• ${closed} closed\n` : ""}${errorsText}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: this.formatTimestamp(new Date().toISOString()),
          },
        ],
      },
    ];

    await this.sendMessage(blocks);
  }

  async testNotification(): Promise<boolean> {
    try {
      await this.client.chat.postMessage({
        channel: this.config.channelId,
        text: "✅ Converge Slack integration is working!",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "✅ Integration Test",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Converge Slack integration is working correctly!",
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Sent at ${this.formatTimestamp(new Date().toISOString())}`,
              },
            ],
          },
        ],
      });
      return true;
    } catch {
      return false;
    }
  }

  private formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}
