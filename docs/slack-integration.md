# Slack Integration

Converge supports bidirectional Slack integration: reading messages from Slack channels and sending Redmine issue updates to Slack.

## Configuration

Add the following to your `.env` file:

```bash
# Slack Bot Token (from Slack App settings)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Default channel to read messages from
SLACK_DEFAULT_CHANNEL_ID=C0123456789

# Additional channels to monitor (comma-separated)
SLACK_MONITOR_CHANNEL_IDS=C0123456789,C0987654321

# Auto-refresh interval in milliseconds
SLACK_REFRESH_INTERVAL_MS=30000

# --- Notifier Configuration (Redmine → Slack) ---
SLACK_NOTIFY_ENABLED=true
SLACK_NOTIFY_CHANNEL_ID=C0123456789
SLACK_NOTIFY_ON_CREATE=true
SLACK_NOTIFY_ON_UPDATE=true
SLACK_NOTIFY_ON_STATUS_CHANGE=true
SLACK_NOTIFY_ON_ASSIGNMENT=true
SLACK_NOTIFY_ON_INTERNAL_NOTE=true
SLACK_NOTIFY_FORMAT=compact
```

## Setup Instructions

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name your app and select your workspace

### 2. Configure Bot Token Scopes

1. In your app, go to **OAuth & Permissions**
2. Under **Bot Token Scopes**, add:
   - `channels:history` - Read messages from public channels
   - `groups:history` - Read messages from private channels
   - `im:history` - Read direct messages
   - `mpim:history` - Read group direct messages

### 3. Install App to Workspace

1. Click **Install to Workspace**
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 4. Get Channel IDs

1. Enable **Channel ID** in Slack settings: Settings → Advanced → Check "Show channel IDs in messages"
2. Right-click a channel → **Copy link** → extract the channel ID (e.g., `C0123456789`)

## Features

### Reading Slack Messages

- **Multi-channel monitoring** - Configure multiple channels to monitor
- **Auto-refresh** - Messages automatically refresh (configurable interval)
- **Thread support** - Click to expand and view thread replies
- **User names** - Display names resolved from Slack API
- **System messages** - Join/leave notifications displayed properly

Access the Slack page at `/slack` (linked from the dashboard navigation).

### Sending Notifications

When `SLACK_NOTIFY_ENABLED=true`, the sync workflow automatically sends notifications:

| Event | Notification |
|-------|--------------|
| New issue created | 📋 New Issue |
| Issue updated | ✏️ Issue Updated (with field changes) |
| Issue closed | ✅ Issue Closed |
| Issue assigned | 👤 Issue Assigned |
| Internal note added | 💬 Internal Note |
| Sync complete | 🔄 Sync Summary |

### Webhook API

External systems can send notifications via `POST /api/slack/notify`:

```bash
curl -X POST http://localhost:3000/api/slack/notify \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update",
    "issue": {
      "id": "abc123",
      "redmineIssueId": 456,
      "subject": "Fix login bug",
      "projectName": "Backend",
      "statusName": "In Progress",
      "priorityName": "High",
      "assignedToName": "John",
      "updatedAt": "2026-04-13T12:00:00Z"
    },
    "changes": [
      {"field": "status", "oldValue": "Open", "newValue": "In Progress"}
    ]
  }'
```

### Test Notification

Send a test notification to verify your setup:

```bash
curl -X POST http://localhost:3000/api/slack/test
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/slack/messages` | Fetch channel messages |
| GET | `/api/slack/thread` | Fetch thread replies |
| POST | `/api/slack/test` | Send test notification |
| POST | `/api/slack/notify` | Send custom notification (webhook) |
| GET | `/api/slack/notify` | Check notifier status |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Redmine   │────▶│  Sync Job    │────▶│  Slack      │
│             │     │  (creates/   │     │  Notifier   │
│             │     │   updates)   │     │             │
└─────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │ Slack API   │
                                         │ (xoxb-...) │
                                         └─────────────┘
```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | - | Bot OAuth token (required) |
| `SLACK_DEFAULT_CHANNEL_ID` | - | Primary channel to read from |
| `SLACK_MONITOR_CHANNEL_IDS` | [] | Additional channels to monitor |
| `SLACK_REFRESH_INTERVAL_MS` | 30000 | Auto-refresh interval (30s) |
| `SLACK_NOTIFY_ENABLED` | false | Enable Redmine→Slack notifications |
| `SLACK_NOTIFY_CHANNEL_ID` | - | Channel for notifications |
| `SLACK_NOTIFY_ON_CREATE` | true | Notify on new issues |
| `SLACK_NOTIFY_ON_UPDATE` | true | Notify on updates |
| `SLACK_NOTIFY_ON_STATUS_CHANGE` | true | Notify on status changes |
| `SLACK_NOTIFY_ON_ASSIGNMENT` | true | Notify on assignment changes |
| `SLACK_NOTIFY_ON_INTERNAL_NOTE` | true | Notify when internal notes are added |
| `SLACK_NOTIFY_FORMAT` | compact | Message format (compact/detailed) |
