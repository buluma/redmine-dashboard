import { requireCurrentUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { SlackClient, type SlackMessage } from "@/src/lib/slack";
import { SlackMessagesClient } from "./slack-client";
import { SlackErrorView } from "./error-view";

export const runtime = "nodejs";

export default async function SlackPage() {
  // Validate session
  await requireCurrentUser();

  let error: string | null = null;
  let messages: SlackMessage[] = [];
  let initialUserNames: Record<string, string> = {};
  let channels: Array<{ id: string; name: string }> = [];
  const defaultChannelId = env.slackDefaultChannelId || "";

  try {
    if (!env.slackBotToken) {
      throw new Error("Slack bot token not configured.");
    }

    const slack = new SlackClient(env.slackBotToken);
    
    // Get list of channels
    const allChannels = await slack.getChannels();
    
    // Filter to monitored channels if configured
    if (env.slackMonitorChannelIds.length > 0) {
      channels = allChannels.filter(c => env.slackMonitorChannelIds.includes(c.id));
    } else {
      channels = allChannels;
    }

    if (channels.length === 0) {
      if (defaultChannelId) {
        try {
          const info = await slack.getChannelInfo(defaultChannelId);
          channels = [info];
        } catch {
          throw new Error("No Slack channels configured and default channel invalid.");
        }
      } else {
        throw new Error("No Slack channels configured.");
      }
    }

    const targetChannelId = defaultChannelId || (channels.length > 0 ? channels[0].id : null);

    if (targetChannelId) {
      messages = await slack.getChannelMessages(targetChannelId);
      
      // Pre-fetch user names for initial display
      const userIds = Array.from(new Set(messages.map(m => m.user).filter(Boolean) as string[]));
      const userMap = await slack.getUsers(userIds);
      initialUserNames = Object.fromEntries(userMap);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load Slack data";
    console.error("Slack page error:", err);
  }

  return (
    <main className="dashboard">
      {error ? (
        <SlackErrorView error={error} />
      ) : (
        <SlackMessagesClient 
          initialMessages={messages} 
          initialUserNames={initialUserNames}
          channelId={defaultChannelId}
          channels={channels}
          refreshIntervalMs={env.slackRefreshIntervalMs}
          channelCount={channels.length}
        />
      )}
    </main>
  );
}
