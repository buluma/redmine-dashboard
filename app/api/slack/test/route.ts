import { NextResponse } from "next/server";
import { env } from "@/src/lib/env";
import { SlackNotifier } from "@/src/lib/slack-notifier";
import { trackFailure } from "@/src/lib/telemetry";

export async function POST() {
  if (!env.slackBotToken) {
    return NextResponse.json(
      { error: "Slack bot token not configured" },
      { status: 500 }
    );
  }

  const channelId = env.slackNotifyChannelId || env.slackDefaultChannelId;
  if (!channelId) {
    return NextResponse.json(
      { error: "No Slack channel configured" },
      { status: 400 }
    );
  }

  try {
    const config = SlackNotifier.createDefaultConfig(channelId, env.redmineBaseUrl || "");
    const notifier = new SlackNotifier(env.slackBotToken, config);
    const success = await notifier.testNotification();

    if (success) {
      return NextResponse.json({ success: true, message: "Test notification sent" });
    } else {
      return NextResponse.json(
        { error: "Failed to send test notification" },
        { status: 500 }
      );
    }
  } catch (error) {
    trackFailure({ event: "slack.test_notification.failed", error, metricName: "slack_test_notification_failed" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
