import webpush from "web-push";
import { env } from "./env";
import { prisma } from "./db";
import { trackInfo, trackFailure } from "./telemetry";

// Initialize VAPID
webpush.setVapidDetails(
  env.pushContact,
  env.vapidPublicKey,
  env.vapidPrivateKey
);

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(
  userId: string,
  options: PushNotificationOptions
) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    notification: {
      title: options.title,
      body: options.body,
      icon: options.icon || "/icons/icon-192x192.png",
      badge: options.badge || "/icons/badge-72x72.png",
      data: options.data || {},
    },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      } catch (error: unknown) {
        const pushError = error as { statusCode?: number };
        if (pushError.statusCode === 404 || pushError.statusCode === 410) {
          trackInfo("push.subscription.expired", { userId });
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        } else {
          trackFailure({ event: "push.send.failed", error, metricName: "push_send_failed" });
        }
      }
    })
  );

  return results;
}
