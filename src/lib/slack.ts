import { WebClient } from "@slack/web-api";

export interface SlackMessage {
  ts: string;
  threadTs?: string;
  user: string | null;
  botId?: string;
  type: string;
  subtype?: string;
  text: string;
  attachments?: Array<{
    text?: string;
    title?: string;
    title_link?: string;
    color?: string;
    fallback?: string;
  }>;
  reactions?: Array<{
    name: string;
    users: string[];
    count: number;
  }>;
  replyCount?: number;
  replyUsers?: string[];
  lastReading?: string;
  parentUserId?: string;
}

// Extended message type from Slack API with optional thread properties
interface SlackMessageEvent {
  ts: string;
  thread_ts?: string;
  user?: string;
  bot_id?: string;
  type?: string;
  subtype?: string;
  text?: string;
  attachments?: Array<{
    text?: string;
    title?: string;
    title_link?: string;
    color?: string;
    fallback?: string;
  }>;
  reactions?: Array<{
    name?: string;
    users?: string[];
    count?: number;
  }>;
  reply_count?: number;
  reply_users?: string[];
  last_read?: string;
  parent_user_id?: string;
}

export interface ChannelInfo {
  id: string;
  name: string;
  isChannel: boolean;
  isGroup: boolean;
  isPrivate: boolean;
  created: number;
  isArchived: boolean;
  isGeneral: boolean;
  nameNormalized: string;
  numMembers: number;
  topic: { value: string; creator: string; lastSet: number } | null;
  purpose: { value: string; creator: string; lastSet: number } | null;
  previousNames: string[];
}

export class SlackClient {
  private client: WebClient;

  constructor(botToken: string) {
    this.client = new WebClient(botToken);
  }

  async getChannelMessages(
    channelId: string,
    options: { limit?: number; oldest?: string; latest?: string } = {}
  ): Promise<SlackMessage[]> {
    const { limit = 100, oldest, latest } = options;

    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit,
        oldest,
        latest,
        inclusive: true,
      });

      if (!result.messages) {
        return [];
      }

      const messages = result.messages as SlackMessageEvent[] | undefined;
      if (!messages) {
        return [];
      }

      return messages.map((msg) => ({
        ts: msg.ts ?? "",
        threadTs: msg.thread_ts,
        user: msg.user ?? null,
        botId: msg.bot_id,
        type: msg.type ?? "message",
        subtype: msg.subtype,
        text: msg.text ?? "",
        attachments: msg.attachments?.map((att) => ({
          text: att.text,
          title: att.title,
          title_link: att.title_link,
          color: att.color,
          fallback: att.fallback,
        })),
        reactions: msg.reactions?.map((r) => ({
          name: r.name ?? "",
          users: r.users ?? [],
          count: r.count ?? 0,
        })),
        replyCount: msg.reply_count,
        replyUsers: msg.reply_users,
        lastReading: msg.last_read,
        parentUserId: msg.parent_user_id,
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Slack API error: ${error.message}`);
      }
      throw new Error("Failed to fetch Slack messages");
    }
  }

  async getChannelInfo(channelId: string): Promise<{ id: string; name: string }> {
    try {
      const result = await this.client.conversations.info({
        channel: channelId,
      });

      if (!result.channel) {
        throw new Error("Channel not found");
      }

      return {
        id: result.channel.id ?? channelId,
        name: result.channel.name ?? "unknown",
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Slack API error: ${error.message}`);
      }
      throw new Error("Failed to fetch channel info");
    }
  }

  async getUsers(userIds: string[]): Promise<Map<string, string>> {
    const userMap = new Map<string, string>();

    try {
      for (const userId of userIds) {
        try {
          const result = await this.client.users.info({ user: userId });
          if (result.user) {
            userMap.set(userId, result.user.real_name || result.user.name || userId);
          }
        } catch {
          // User not found, use ID as fallback
          userMap.set(userId, userId);
        }
      }
    } catch {
      // If bulk lookup fails, return empty map
    }

    return userMap;
  }

  async getThreadReplies(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      const threadMessages = result.messages as SlackMessageEvent[] | undefined;
      if (!threadMessages) {
        return [];
      }

      return threadMessages.map((msg) => ({
        ts: msg.ts ?? "",
        threadTs: msg.thread_ts,
        user: msg.user ?? null,
        botId: msg.bot_id,
        type: msg.type ?? "message",
        subtype: msg.subtype,
        text: msg.text ?? "",
        attachments: msg.attachments?.map((att) => ({
          text: att.text,
          title: att.title,
          title_link: att.title_link,
          color: att.color,
          fallback: att.fallback,
        })),
        reactions: msg.reactions?.map((r) => ({
          name: r.name ?? "",
          users: r.users ?? [],
          count: r.count ?? 0,
        })),
        replyCount: msg.reply_count,
        replyUsers: msg.reply_users,
        lastReading: msg.last_read,
        parentUserId: msg.parent_user_id,
      }));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Slack API error: ${error.message}`);
      }
      throw new Error("Failed to fetch thread replies");
    }
  }
}
