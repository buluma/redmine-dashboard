import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { SlackClient } from "@/src/lib/slack";
import { trackFailure } from "@/src/lib/telemetry";

export async function GET(request: NextRequest) {
  if (!(await getAuthenticatedUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const channelId = searchParams.get("channelId") || env.slackDefaultChannelId;

  if (!env.slackBotToken) {
    return NextResponse.json(
      { error: "Slack bot token not configured" },
      { status: 500 }
    );
  }

  if (!channelId) {
    return NextResponse.json(
      { error: "Channel ID not provided" },
      { status: 400 }
    );
  }

  try {
    const slackClient = new SlackClient(env.slackBotToken);
    const messages = await slackClient.getChannelMessages(channelId, { limit: 100 });

    // Collect all user IDs for name lookup
    const userIds = new Set<string>();
    messages.forEach((msg) => {
      if (msg.user) userIds.add(msg.user);
      if (msg.replyUsers) {
        msg.replyUsers.forEach((u) => userIds.add(u));
      }
    });

    // Batch fetch user names
    const users: Record<string, string> = {};
    if (userIds.size > 0) {
      const userMap = await slackClient.getUsers(Array.from(userIds));
      userMap.forEach((name, id) => {
        users[id] = name;
      });
    }

    return NextResponse.json({ messages, users });
  } catch (error) {
    trackFailure({ event: "slack.messages.list.failed", error, metricName: "slack_messages_list_failed" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Slack messages" },
      { status: 500 }
    );
  }
}
