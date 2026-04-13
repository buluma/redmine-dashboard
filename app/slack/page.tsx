import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { SlackMessagesClient } from "./slack-client";
import { SlackClient } from "@/src/lib/slack";

export const runtime = "nodejs";

export default async function SlackPage() {
  const user = await requireCurrentUser();

  const channelId = env.slackDefaultChannelId;
  const botToken = env.slackBotToken;

  let messages: Awaited<ReturnType<SlackClient["getChannelMessages"]>> = [];
  let channelInfo: { id: string; name: string } | null = null;
  let error: string | null = null;

  if (!botToken) {
    error = "Slack bot token not configured. Please set SLACK_BOT_TOKEN in your environment.";
  } else if (!channelId) {
    error = "Slack channel ID not configured. Please set SLACK_DEFAULT_CHANNEL_ID in your environment.";
  } else {
    try {
      const slackClient = new SlackClient(botToken);
      const [fetchedMessages, fetchedChannel] = await Promise.all([
        slackClient.getChannelMessages(channelId, { limit: 100 }),
        slackClient.getChannelInfo(channelId),
      ]);
      messages = fetchedMessages;
      channelInfo = fetchedChannel;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to fetch Slack messages";
    }
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <h1>Slack Messages</h1>
            <p className="muted">
              {channelInfo 
                ? `#${channelInfo.name}` 
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
            channelId={channelId ?? ""}
            channelName={channelInfo?.name ?? ""}
          />
        </>
      )}
    </main>
  );
}
