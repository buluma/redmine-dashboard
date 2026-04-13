import { NextRequest, NextResponse } from "next/server";
import { env } from "@/src/lib/env";
import { SlackClient } from "@/src/lib/slack";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const channelId = searchParams.get("channelId");
  const threadTs = searchParams.get("threadTs");

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

  if (!threadTs) {
    return NextResponse.json(
      { error: "Thread timestamp not provided" },
      { status: 400 }
    );
  }

  try {
    const slackClient = new SlackClient(env.slackBotToken);
    const messages = await slackClient.getThreadReplies(channelId, threadTs);

    // Collect all user IDs for name lookup
    const userIds = new Set<string>();
    messages.forEach((msg) => {
      if (msg.user) userIds.add(msg.user);
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
    console.error("Slack thread API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch thread" },
      { status: 500 }
    );
  }
}
