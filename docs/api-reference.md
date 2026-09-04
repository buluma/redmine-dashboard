# API Reference

This document describes the Converge backend API, including web and mobile
routes.

## Auth and Redmine Connection

### GET /api/session/me

Returns the current browser session user or `null`.

### DELETE /api/session/me

Logs out browser session.

### POST /api/redmine/connect

Connects a Redmine account and starts initial sync.

Request body:

```json
{
  "baseUrl": "https://redmine.example.com",
  "apiKey": "your-redmine-api-key"
}
```

Notes:

- Returns `502` when Converge cannot reach Redmine due to upstream network/TLS
  issues.

### GET /api/redmine/bootstrap

Returns bootstrap capability and current credential state.

### POST /api/redmine/bootstrap

Bootstraps from `REDMINE_BASE_URL` and `REDMINE_API_KEY`.

## Issue APIs (Web)

### GET /api/issues

Returns cached issues for current user.

Query params:

- `status`, `priority`, `search`
- `sort=updated_desc|updated_asc|priority|due_date`
- `page`, `pageSize`
- `searchMode=local|remote|hybrid` (current UI uses `local` and `hybrid`)
- `scope=issues|all` (used for remote search)
- `openOnly=true|false` (used for remote search)

Response includes:

- `items[]` with `journals`, `timeEntries`, `githubLinks`, `attachments`,
  `relations`, `allowedStatuses`, `children`
- `filters.statuses`, `filters.priorities`
- `source=local_cache|hybrid`

Hybrid mode behavior:

- Remote search results are merged with local cache rows and de-duplicated by
  Redmine issue id.
- Result ordering honors the requested `sort` mode after merge.
- `total` represents full pagination semantics for hybrid responses (not only
  current-page merged count).

### POST /api/issues

Creates a new issue in Redmine and syncs it to the local cache.

Request body:

```json
{
  "subject": "Issue subject",
  "description": "Issue description",
  "projectId": 12,
  "statusId": 1,
  "priorityId": 4,
  "dueDate": "2026-05-01",
  "trackerId": 1
}
```

Response includes the synced `Issue` object.

### GET /api/issues/[id]

Returns enriched issue detail for the selected issue id (cache-backed),
including:

- `journals`
- `githubLinks`
- `timeEntries`
- `attachments`
- `relations`
- `children`
- `allowedStatuses` (derived from Redmine workflow metadata in cache)

### GET /api/issues/[id]/status

Returns allowed workflow transitions from Redmine (`allowedStatuses`,
`allowedStatusIds`).

### POST /api/issues/[id]/status

Updates issue status (validated against allowed transitions when provided by
Redmine).

### POST /api/issues/[id]/comment

Posts Redmine issue note.

### POST /api/issues/[id]/timelog

Creates Redmine time entry for issue.

Request body:

```json
{
  "hours": 1.5,
  "activityId": 9,
  "comment": "Worked on API",
  "spentOn": "2026-02-26"
}
```

### PUT /api/issues/[id]/edit

Updates issue fields and pushes changes to Redmine.

Request body (all fields optional; at least one required):

```json
{
  "subject": "New title",
  "description": "Updated description with *Textile* formatting",
  "priorityId": 5,
  "dueDate": "2026-05-01",
  "startDate": "2026-04-01",
  "estimatedHours": 20,
  "categoryId": 32,
  "customFields": [
    { "id": 18, "value": "77" }
  ]
}
```

### POST /api/issues/[id]/assign

Assigns issue to a Redmine user.

Request body:

```json
{ "userId": 194 }
```

### POST /api/issues/bulk-status

Bulk status update with per-issue transition checks.

### GET /api/issues/[id]/github-links

### POST /api/issues/[id]/github-links

### DELETE /api/issues/[id]/github-links/[linkId]

GitHub references attached to locally cached issue.

## Attachments (Web)

### GET /api/issues/[id]/attachments

Returns cached issue attachments.

### POST /api/issues/[id]/attachments

Uploads attachment to Redmine (`/uploads.json` then issue update).

Multipart fields:

- `file` (required)
- `description` (optional)

Current limit: `10MB`.

### GET /api/issues/[id]/attachments/[attachmentId]

Proxies attachment download through Converge backend (API key never exposed to
clients).

## Relations (Web)

### POST /api/issues/[id]/relations

Creates Redmine issue relation.

Request body:

```json
{
  "issueToId": 456,
  "relationType": "blocks",
  "delay": 2
}
```

Allowed `relationType` values:

- `relates`, `duplicates`, `duplicated`, `blocks`, `blocked`, `precedes`,
  `follows`, `copied_to`, `copied_from`

### DELETE /api/issues/[id]/relations/[relationId]

Deletes Redmine relation and local cache row.

## Projects (Web)

### GET /api/projects

Returns a list of active Redmine projects.

## Time Entry Lifecycle (Web)

### GET /api/time-entries

Lists Redmine time entries.

Query params:

- `issueId` (optional)
- `from` (YYYY-MM-DD)
- `to` (YYYY-MM-DD)
- `user=me`
- `page`, `pageSize`

### PATCH /api/time-entries/[id]

Updates Redmine time entry (requires ownership in local cache).

Request body (at least one field required):

```json
{
  "hours": 2,
  "activityId": 9,
  "comment": "Refined parser",
  "spentOn": "2026-02-26"
}
```

### DELETE /api/time-entries/[id]

Deletes Redmine time entry (requires ownership in local cache).

## Events / SSE

### GET /api/events/stream

Server-Sent Events stream for real-time dashboard updates. Delivers the
following event types:

- `issue.created` — New issue synced to local cache
- `issue.updated` — Existing issue updated during sync
- `sync.tick.completed` — A full sync tick finished (dashboard refreshes on this
  single event rather than per-issue updates)

## Sync and Ops

### POST /api/sync/manual-pull

Triggers full manual sync.

### GET /api/sync/status

Returns sync state and latest job summary.

### GET /api/sync/jobs

Returns recent sync jobs.

### GET /api/reports

Returns report data from local cache.

Optional query params for remote time-entry mode:

- `timeEntries=remote`
- `from`, `to` (YYYY-MM-DD)

### GET /api/internal/activities

Returns time-entry activity catalog (cached from Redmine enumerations when
available).

Notes:

- Requires authenticated web session.
- Returns `401` when unauthenticated.

### GET /api/internal/users

Returns assignable Redmine users (from Redmine API if admin access, else local
`RedmineUser` cache).

### GET /api/internal/priorities

Returns issue priority enumerations (from Redmine API if available, else local
`RedmineEnumeration` cache).

### GET /api/internal/enumerations

Returns structured enumerations from the local catalog.

Query params:

- `kind`: `issue_priority` | `time_entry_activity` (default: `issue_priority`)

## PWA & Push Notifications

### POST /api/push/subscribe

Stores or updates a Web Push subscription.

Request body:

```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

### DELETE /api/push/subscribe

Removes a Web Push subscription.

Query params:

- `endpoint`: the subscription endpoint to remove

## AI and Chat APIs

### POST /api/chat

The primary chat endpoint. Returns a message from the LLM, optionally including
`pendingToolCalls` if the model wants to take an action.

Request body:

```json
{
  "messages": [
    { "role": "user", "content": "Close issue #123" }
  ]
}
```

Response for mutating actions:

```json
{
  "message": { "role": "assistant", "content": "I'd like to close issue #123. Please confirm.", "model": "..." },
  "pendingToolCalls": [
    { "id": "tc_1", "name": "close_issue", "arguments": { "issue_id": 123 }, "summary": "Close issue #123" }
  ],
  "conversationContext": [...]
}
```

### POST /api/chat/execute-tools

Executes user-confirmed tool calls and returns a final natural-language summary.

Request body:

```json
{
  "toolCalls": [...],
  "conversationContext": [...]
}
```

## GET /api/health

System health probe.

## Mobile API

All `/api/mobile/v1/*` routes require `Authorization: Bearer <token>` except
pairing.

### POST /api/mobile/v1/pair/connect

Pairs mobile device and returns token.

Notes:

- Returns `502` when Converge cannot reach Redmine due to upstream network/TLS
  issues.

### GET /api/mobile/v1/me

Returns authenticated mobile user + token metadata.

### GET /api/mobile/v1/issues

Same filtering and search options as `/api/issues`.

### POST /api/mobile/v1/issues

Creates a new issue in Redmine from a mobile device. Requires Bearer
authentication. Same request body as `/api/issues`.

### GET /api/mobile/v1/issues/[id]

Returns enriched issue detail including attachments, relations, allowed
statuses, and children. **Note:** `[id]` accepts both **integer Redmine IDs**
(e.g., `123`) and **string cuids** for local-only issues (e.g., `clx...`). The
route resolves the correct lookup based on whether the ID is numeric.

### POST /api/mobile/v1/issues/[id]/comment

Posts comment and refreshes local cache for that issue.

### GET /api/mobile/v1/issues/[id]/github-links

### POST /api/mobile/v1/issues/[id]/github-links

### DELETE /api/mobile/v1/issues/[id]/github-links/[linkId]

GitHub link management for mobile.

### GET /api/mobile/v1/issues/[id]/attachments

### POST /api/mobile/v1/issues/[id]/attachments

### GET /api/mobile/v1/issues/[id]/attachments/[attachmentId]

Attachment list/upload/download proxy for mobile.

### POST /api/mobile/v1/issues/[id]/relations

### DELETE /api/mobile/v1/issues/[id]/relations/[relationId]

Relation management for mobile.

**Note:** For all mobile endpoints above, `[id]` accepts integer Redmine IDs and
string cuids. Local-only issues (`source: "local"`) cannot be synced to Redmine
— time entry updates, status changes, and comments on local issues are blocked
at the route level.

### POST /api/mobile/v1/tokens/rotate

Rotates current mobile token.

### DELETE /api/mobile/v1/tokens/current

Revokes current mobile token (logout).

## Slack Integration

### GET /api/slack/messages

Fetches messages from a Slack channel.

Query params:

- `channelId` (optional, defaults to `SLACK_DEFAULT_CHANNEL_ID`)

### GET /api/slack/thread

Fetches thread replies from a Slack message.

Query params:

- `channelId` (required)
- `threadTs` (required) - message timestamp

### POST /api/slack/test

Sends a test notification to verify Slack integration.

### POST /api/slack/notify

Webhook endpoint for external systems to send Slack notifications.

Request body:

```json
{
  "action": "create|update|close|assign|test",
  "issue": {
    "id": "...",
    "redmineIssueId": 123,
    "subject": "Issue subject",
    "projectName": "My Project",
    "statusName": "In Progress",
    "priorityName": "High",
    "assignedToName": "John Doe",
    "updatedAt": "2026-04-13T12:00:00Z"
  },
  "changes": [
    { "field": "status", "oldValue": "Open", "newValue": "In Progress" }
  ]
}
```

**Note:** `redmineIssueId` is nullable (`number | null`) for local-only issues.
When `null`, the issue has no Redmine counterpart.

### GET /api/slack/notify

Returns Slack notifier configuration status.

### POST /api/slack/create-issue

Creates a Redmine issue from Slack message content using AI.

Request body:

```json
{
  "messageText": "The Slack message text to analyze",
  "projectName": "My Project",
  "priorityName": "High",
  "assigneeName": "John Doe",
  "dueDate": "2026-05-01"
}
```

### GET /api/slack/create-issue

Analyzes Slack messages for potential Redmine issues.

Query params:

- `channelId`: Slack channel (default: from env)
- `threadTs`: specific thread
- `limit`: messages to analyze (default 20)

## Search API

### GET /api/search

Full-text search with smart ranking.

Query params:

- `q`: search query (required, min 2 chars)
- `limit`: max results (default 20)
- `offset`: pagination
- `boost`: enable smart ranking (default true)

Features: field boosts, recency, status weighting

## AI APIs

### GET /api/ai/stream

Streaming chat via SSE.

Query params:

- `message`: text to send

### GET/POST /api/ai/summarize-stale

Bulk AI summarization of stale issues.

## Saved Views API

### GET/POST /api/saved-views

CRUD for saved filter views.

### PUT/DELETE /api/saved-views/[id]

Update/delete saved view.

## Reports API

### GET /api/reports/time-export

Exports time entries with project breakdown.

Query params:

- `startDate`: ISO date string (default: 30 days ago)
- `endDate`: ISO date string (default: today)
- `format`: `"csv" | "json"` (default: json)

Response (JSON):

```json
{
  "period": { "start": "...", "end": "..." },
  "summary": { "totalHours": 100, "totalEntries": 50, "uniqueIssues": 20, "totalWakaHours": 40 },
  "byProject": [
    { "name": "Project A", "hours": 50, "entries": 25, "issues": 10, "wakaHours": 20 }
  ],
  "entries": [...]
}
```

### GET /api/reports/burndown

Returns burndown chart data for a date range (simulates sprint burndown).

Query params:

- `startDate`: ISO date string (default: 14 days ago)
- `endDate`: ISO date string (default: today)
- `projectId`: filter by project (optional)

Response:

```json
{
  "sprint": {
    "startDate": "...",
    "endDate": "...",
    "totalPoints": 50,
    "days": 14
  },
  "points": [
    { "date": "2026-04-01", "remaining": 50, "ideal": 46, "closed": 0 },
    { "date": "2026-04-02", "remaining": 45, "ideal": 42, "closed": 5 }
  ],
  "summary": {
    "totalIssues": 50,
    "totalClosed": 45,
    "remaining": 5,
    "velocity": 3.2,
    "burnRate": 90
  }
}
```

### GET /api/reports/custom

Returns saved custom reports for current user.

### POST /api/reports/custom

Creates a new custom report.

Request body:

```json
{
  "type": "burndown",
  "name": "Q2 Sprint 1",
  "config": { "sprintLength": 14, "projectId": "My Project" }
}
```

### GET /api/reports/custom/[id]

Returns a single custom report.

### PUT /api/reports/custom/[id]

Updates a custom report.

### DELETE /api/reports/custom/[id]

Deletes a custom report.

## Offline Sync

There is no server-side sync-queue API. Offline mutations are queued entirely client-side (IndexedDB, `lib/offline-db.ts`) and, once back online, are flushed straight to the same routes an online client would call — `/api/issues/[id]/status`, `/api/issues/[id]/assign`, `/api/issues/[id]/comment`, `/api/time-entries` — see [offline-sync.md](offline-sync.md) for the full mechanism.

## Webhook APIs

### GET /api/webhooks/subscriptions

Lists webhook subscriptions (ADMIN/EDITOR only). Secrets are masked in the response.

### POST /api/webhooks/subscriptions

Creates a webhook subscription (ADMIN/EDITOR only).

Request body:

```json
{
  "name": "My webhook",
  "url": "https://example.com/webhook",
  "secret": "optional-shared-secret",
  "events": ["issue.created", "issue.updated"]
}
```

### GET /api/webhooks/subscriptions/[id]

Returns a single subscription (ADMIN/EDITOR only).

### PATCH /api/webhooks/subscriptions/[id]

Updates a subscription (ADMIN/EDITOR only).

### DELETE /api/webhooks/subscriptions/[id]

Deletes a subscription (ADMIN/EDITOR only).

### POST /api/webhooks/test

Sends a test delivery to verify webhook configuration (ADMIN/EDITOR only).
