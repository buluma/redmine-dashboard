# Push Notifications

Converge supports native push notifications for browser-based PWA (Progressive Web App) users. Notifications alert users to important ticket events without requiring them to keep the browser window open.

## Overview

Push notifications in Converge use the **Web Push protocol** with `web-push` for server-side delivery:

- **Subscription Storage**: Subscriptions stored in `PushSubscription` table
- **VAPID Keys**: Browser-compliant encryption for push payloads
- **Payload Encryption**: AES-128-GCM encryption for notification content
- **Delivery Services**: FCM (Android), APNs (iOS), and universal browser push services

## Supported Triggers

Notifications are automatically sent for:

| Trigger | When It Fires |
|---------|----------------|
| **New Assignment** | Issue assigned to user |
| **Status Change** | Issue status changes to "In Progress" or "Resolved" |
| **Critical Priority** | Issue priority set to "High" or "Urgent" |
| **Mention** | User is mentioned in issue notes |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │  Service Worker │     │  Push Subscription      │   │
│  │  (sw.ts)        │────▶│  (window.Notification)  │   │
│  └────────┬────────┘     └─────────────────────────┘   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────────────────────────────────┐      │
│  │  VAPID Keys (public/private)                 │      │
│  │  Stored in browser for encryption            │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS Push
                            │
┌─────────────────────────────────────────────────────────┐
│                  Converge Server                        │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │  web-push       │────▶│  PushSubscription DB    │   │
│  │  utility        │     │  (prisma schema)        │   │
│  └─────────────────┘     └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
                            │ FCM/Autopush/Apple
                            ▼
                    ┌───────────────┐
                    │ Push Network  │
                    └───────────────┘
```

## Setup

### VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for push notifications to work.

#### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

This outputs:
```
Public Key:
BN... (base64)

Private Key:
Kf... (base64)
```

#### Configure Environment

Add to `.env.local`:

```bash
# VAPID Configuration
VAPID_PUBLIC_KEY=BN...your-public-key...
VAPID_PRIVATE_KEY=Kf...your-private-key...
VAPID_CONTACT=https://yourdomain.com  # Optional: Your website URL
```

> **Note**: The `VAPID_CONTACT` should be a valid URL where users can reach you (e.g., your website or support email).

### Browser Support

Push notifications require:

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 70+ | Works on Android and desktop |
| Firefox | 63+ | Desktop and Android |
| Safari | 16.4+ | macOS 13+, iOS 16.4+ |
| Edge | 79+ | Chromium-based |

> **Important**: Safari requires HTTPS and explicit user permission for push notifications.

## Implementation Details

### 1. Service Worker Registration

The service worker (`app/sw.ts`) handles push events:

```typescript
// Listen for push events
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const notification = data.notification || {};

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon || "/icons/icon-192x192.png",
      badge: notification.badge || "/icons/badge-72x72.png",
      data: notification.data || {},
    })
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow(notification.data?.url || "/")
  );
});
```

### 2. Subscription Management

#### Creating a Subscription

```typescript
// app/api/push/subscribe/route.ts
export async function POST(request: Request) {
  const { userId } = await auth();
  const data = await request.json();

  const { endpoint, keys } = data;

  await prisma.pushSubscription.create({
    data: {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return Response.json({ success: true });
}
```

#### Deleting a Subscription

```typescript
// app/api/push/subscribe/route.ts
export async function DELETE(request: Request) {
  const { userId } = await auth();
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return Response.json({ success: true });
}
```

### 3. Sending Notifications

```typescript
// lib/push.ts
import webpush from "web-push";

webpush.setVapidDetails(
  env.pushContact,
  env.vapidPublicKey,
  env.vapidPrivateKey
);

export async function sendPushNotification(
  userId: string,
  options: { title: string; body: string; icon?: string; badge?: string }
) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  const payload = JSON.stringify({
    notification: {
      title: options.title,
      body: options.body,
      icon: options.icon || "/icons/icon-192x192.png",
      badge: options.badge || "/icons/badge-72x72.png",
    },
  });

  await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, payload))
  );
}
```

### 4. Triggering Notifications

```typescript
// lib/sync.ts - Example trigger
export async function notifyIssueAssignment(
  issue: Issue,
  assignee: RedmineUser
) {
  await sendPushNotification(assignee.id, {
    title: "New Issue Assignment",
    body: `You've been assigned to #${issue.redmineIssueId}: ${issue.subject}`,
    data: { url: `/issues/${issue.redmineIssueId}` },
  });
}
```

## Notification Options

| Field | Description | Required |
|-------|-------------|----------|
| `title` | Notification title (max 256 chars) | Yes |
| `body` | Notification body text | Yes |
| `icon` | Icon URL (default: `/icons/icon-192x192.png`) | No |
| `badge` | Badge icon (default: `/icons/badge-72x72.png`) | No |
| `data.url` | URL to open when clicking notification | No |

## Testing Push Notifications

### 1. Verify Service Worker Registration

```javascript
// In browser console
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    console.log("Service Worker registered:", registration.scope);
  });
}
```

### 2. Check Push Subscription

```javascript
navigator.serviceWorker.ready.then((registration) => {
  registration.pushManager.getSubscription().then((subscription) => {
    if (subscription) {
      console.log("Subscription active:", subscription.endpoint);
    } else {
      console.log("No active subscription");
    }
  });
});
```

### 3. Request Permission

```javascript
Notification.requestPermission().then((permission) => {
  if (permission === "granted") {
    console.log("Push permission granted");
  }
});
```

### 4. Simulate a Push Event

```javascript
// In Service Worker (for testing)
self.addEventListener("push", (event) => {
  console.log("Push event received", event);
  // Your notification logic here
});
```

## Troubleshooting

### "Push permission denied" Error

**Cause**: User denied push permission or browser doesn't support it.

**Solution**:
```javascript
if (Notification.permission !== "granted") {
  await Notification.requestPermission();
}
```

### "Subscription not found" Error

**Cause**: User unsubscribed or cleared browser data.

**Solution**: The server automatically deletes expired subscriptions (HTTP 404/410).

### Notifications Not Showing on iOS

**Cause**: iOS requires HTTPS and explicit user interaction.

**Solution**:
- Ensure your site is served over HTTPS
- Trigger subscription after user interaction (click/tap)

### VAPID Key Mismatch

**Cause**: Public/private key pair doesn't match what browser expects.

**Solution**:
1. Generate new VAPID keys
2. Update environment variables
3. Clear browser push subscriptions
4. Re-subscribe users

## Performance Considerations

1. **Batch Sending**: Use `Promise.allSettled()` to send to multiple subscriptions without failing on single errors

2. **Error Handling**: Auto-delete expired subscriptions (HTTP 404/410)

3. **Rate Limiting**: Consider limiting notifications per user per hour

4. **Payload Size**: Keep notification payloads under 3KB for reliable delivery

## Future Enhancements

- [ ] Action buttons on notifications (mark as read, close, etc.)
- [ ] Grouped notifications for multiple events
- [ ] Do Not Disturb / quiet hours
- [ ] Device-specific notification preferences
- [ ] Rich notifications with images
