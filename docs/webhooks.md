# Webhook Subscriptions

Converge supports outgoing webhooks that notify external systems when ticket events occur. External systems can subscribe to specific event types and receive real-time HTTP callbacks.

## Overview

Unlike traditional webhooks where you configure a fixed URL, Converge uses a **subscription model**:
- External systems create subscriptions via API
- Each subscription specifies which events to receive
- Subscriptions can be enabled/disabled without deletion
- HMAC signatures verify payload authenticity

## Event Types

| Event | Description |
|-------|-------------|
| `ticket.created` | New ticket created |
| `ticket.updated` | Ticket details changed |
| `ticket.status_changed` | Ticket status changed |
| `ticket.assigned` | Ticket assigned to user |
| `ticket.completed` | Ticket marked as completed |
| `ticket.deleted` | Ticket deleted (future) |

## API Endpoints

### List Subscriptions
```http
GET /api/webhooks/subscriptions
```
Requires Admin or Editor role.

### Create Subscription
```http
POST /api/webhooks/subscriptions
Content-Type: application/json

{
  "name": "My External System",
  "url": "https://my-system.com/webhook",
  "secret": "optional-hmac-secret",
  "events": ["ticket.created", "ticket.status_changed"]
}
```

### Toggle Subscription
```http
PATCH /api/webhooks/subscriptions/{id}
Content-Type: application/json

{ "active": true }
```

### Delete Subscription
```http
DELETE /api/webhooks/subscriptions/{id}
```

### Test Webhook
```http
POST /api/webhooks/test
```
Sends a test payload to all active subscribers.

## Webhook Payload

```json
{
  "id": "wh_1234567890_abc123",
  "event": "ticket.status_changed",
  "timestamp": "2026-04-14T12:00:00.000Z",
  "ticket": {
    "id": "clx1234567890abcdef",
    "redmineIssueId": 1234,
    "subject": "Fix login bug",
    "description": "Users cannot login with SSO",
    "projectName": "Backend API",
    "trackerName": "Bug",
    "statusName": "In Progress",
    "priorityName": "High",
    "assignedToId": "42",
    "assignedToName": "John Doe",
    "authorId": "10",
    "authorName": "Jane Smith",
    "dueDate": "2026-04-20T00:00:00.000Z",
    "doneRatio": 50,
    "createdAt": "2026-04-10T09:00:00.000Z",
    "updatedAt": "2026-04-14T12:00:00.000Z"
  },
  "changes": [
    {
      "field": "status",
      "oldValue": "New",
      "newValue": "In Progress"
    }
  ],
  "metadata": {
    "triggeredBy": "user-id-here"
  }
}
```

## Signature Verification

If you provide a `secret` when creating the subscription, each payload will include an HMAC signature:

```
X-Webhook-Signature: sha256=abc123...
X-Webhook-Delivery: wh_1234567890_abc123
X-Webhook-Event: ticket.status_changed
X-Webhook-Timestamp: 2026-04-14T12:00:00.000Z
```

To verify the signature in Node.js:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

## UI

Manage subscriptions visually at `/webhooks` (Admin/Editor only).

## Database

Subscriptions are stored in the `WebhookSubscription` table:
- `name` - Human-readable name
- `url` - Webhook endpoint URL
- `secret` - HMAC secret (empty = no signing)
- `events` - JSON array of subscribed events
- `active` - Enable/disable without deleting
- `lastTriggeredAt` - Last delivery timestamp
- `lastStatus` - Last HTTP response status
- `failureCount` - Consecutive delivery failures