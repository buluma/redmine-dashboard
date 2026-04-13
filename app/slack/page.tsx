import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { SlackMessagesClient } from "./slack-client";
import { SlackClient } from "@/src/lib/slack";
import { SlackHeader } from "./slack-header";

export const runtime = "nodejs";

export default async function SlackPage() {
  const user = await requireCurrentUser();

  const botToken = env.slackBotToken;

  // Get all channel IDs to monitor (default + additional)
  const allChannelIds = env.slackDefaultChannelId 
    ? [env.slackDefaultChannelId, ...env.slackMonitorChannelIds.filter(id => id !== env.slackDefaultChannelId)]
    : env.slackMonitorChannelIds;

  let messages: Awaited<ReturnType<SlackClient["getChannelMessages"]>> = [];
  let channels: Array<{ id: string; name: string }> = [];
  let error: string | null = null;
  let initialUserNames: Record<string, string> = {};

  if (!botToken) {
    error = "Slack bot token not configured. Please set SLACK_BOT_TOKEN in your environment.";
  } else if (allChannelIds.length === 0) {
    error = "No Slack channels configured. Please set SLACK_DEFAULT_CHANNEL_ID or SLACK_MONITOR_CHANNEL_IDS in your environment.";
  } else {
    try {
      const slackClient = new SlackClient(botToken);
      channels = await slackClient.getChannels();

      // Get channel names for all monitored channels
      const channelMap = new Map(channels.map((c) => [c.id, c.name]));
      const monitoredChannels = allChannelIds.map((id) => ({
        id,
        name: channelMap.get(id) || id,
      }));

      // Fetch messages from default channel
      const defaultChannelId = env.slackDefaultChannelId || allChannelIds[0];
      const channelName = channelMap.get(defaultChannelId) || defaultChannelId;
      messages = await slackClient.getChannelMessages(defaultChannelId);

      // Build user names map
      const userIds = [...new Set(messages.map((m) => m.user).filter(Boolean))];
      for (const userId of userIds) {
        if (userId) {
          const userInfo = await slackClient.getUserInfo(userId);
          if (userInfo) {
            initialUserNames[userId] = userInfo;
          }
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to fetch Slack messages";
    }
  }

  const defaultChannelId = env.slackDefaultChannelId || (channels[0]?.id ?? "");

  return (
    <main className="dashboard">
      <SlackHeader
        channelCount={channels.length}
        messageCount={messages.length}
        onRefresh={async () => {
          // This will be handled by the client component
          // Server-side refresh is not needed since the page is already server-rendered
        }}
        onTestNotification={async () => {
          // Test notification handled client-side
        }}
      />

      {error ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>Configuration Error</h2>
              <p className="muted">{error}</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="card reports-shell">
            <div className="reports-head">
              <div>
                <h2>Channel Overview</h2>
                <p className="muted">
                  {messages.length} message{messages.length !== 1 ? "s" : ""} loaded
                </p>
              </div>
            </div>
          </section>

          <SlackMessagesClient 
            initialMessages={messages} 
            initialUserNames={initialUserNames}
            channelId={defaultChannelId}
            channels={channels}
            refreshIntervalMs={env.slackRefreshIntervalMs}
          />
        </>
      )}
    </main>
  );
}
