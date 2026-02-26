# API Reference

This document describes the NRCC backend API, including web and mobile routes.

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
- Returns `502` when NRCC cannot reach Redmine due to upstream network/TLS issues.

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
- `items[]` with `journals`, `timeEntries`, `githubLinks`, `attachments`, `relations`, `allowedStatuses`, `children`
- `filters.statuses`, `filters.priorities`
- `source=local_cache|hybrid`

### GET /api/issues/[id]/status
Returns allowed workflow transitions from Redmine (`allowedStatuses`, `allowedStatusIds`).

### POST /api/issues/[id]/status
Updates issue status (validated against allowed transitions when provided by Redmine).

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
Proxies attachment download through NRCC backend (API key never exposed to clients).

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
- `relates`, `blocks`, `precedes`, `follows`, `duplicates`

### DELETE /api/issues/[id]/relations/[relationId]
Deletes Redmine relation and local cache row.

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
Returns time-entry activity catalog (cached from Redmine enumerations when available).

### GET /api/health
System health probe.

## Mobile API

All `/api/mobile/v1/*` routes require `Authorization: Bearer <token>` except pairing.

### POST /api/mobile/v1/pair/connect
Pairs mobile device and returns token.

Notes:
- Returns `502` when NRCC cannot reach Redmine due to upstream network/TLS issues.

### GET /api/mobile/v1/me
Returns authenticated mobile user + token metadata.

### GET /api/mobile/v1/issues
Same filtering and search options as `/api/issues`.

### GET /api/mobile/v1/issues/[id]
Returns enriched issue detail including attachments, relations, allowed statuses, and children.

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

### POST /api/mobile/v1/tokens/rotate
Rotates current mobile token.

### DELETE /api/mobile/v1/tokens/current
Revokes current mobile token (logout).
