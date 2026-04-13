import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { SlackMessagesClient } from "./slack-client";
import { SlackClient } from "@/src/lib/slack";

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
      
      // Get channel info for all channels
      const channelMap = await slackClient.getChannelsInfo(allChannelIds);
      channels = Array.from(channelMap.values());
      
      // Fetch messages from default channel
      const defaultChannelId = env.slackDefaultChannelId || allChannelIds[0];
      messages = await slackClient.getChannelMessages(defaultChannelId, { limit: 100 });
      
      // Fetch user names for all users in messages
      const userIds = new Set<string>();
      messages.forEach((msg) => {
        if (msg.user) userIds.add(msg.user);
        if (msg.replyUsers) {
          msg.replyUsers.forEach((u) => userIds.add(u));
        }
      });
      
      if (userIds.size > 0) {
        const userMap = await slackClient.getUsers(Array.from(userIds));
        userMap.forEach((name, id) => {
          initialUserNames[id] = name;
        });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to fetch Slack messages";
    }
  }

  const defaultChannelId = env.slackDefaultChannelId || (channels[0]?.id ?? "");

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Slack</p>
            <h1>Slack Messages</h1>
            <p className="muted">
              {channels.length > 0 
                ? `${channels.length} channel${channels.length !== 1 ? "s" : ""} monitored` 
                : error 
                  ? "Configuration Required" 
                  : "Loading..."}
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

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
