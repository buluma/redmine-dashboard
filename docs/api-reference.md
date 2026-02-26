# API Reference

This document provides a detailed reference for the API endpoints available in the NRCC application.

## Session and Connection

### GET /api/session/me

Retrieves the current user's session information.

**Response (200)**

- If the user is authenticated, returns the user object.
- If the user is not authenticated, returns `null`.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/session/me
```

---

### DELETE /api/session/me

Logs the user out by clearing the session cookie.

**Response (200)**

Returns a confirmation message.

**cURL Example**

```bash
curl -X DELETE http://localhost:3000/api/session/me
```

---

### POST /api/redmine/connect

Connects a Redmine account, creates a new session, and triggers an initial full sync of the user's data.

**Request Body**

```json
{
  "baseUrl": "https://redmine.example.com",
  "apiKey": "your-redmine-api-key"
}
```

**Response (200)**

Returns the user object upon successful connection.

**Errors**

| Code | Message                 |
| :--- | :---------------------- |
| 400  | Invalid request body.   |
| 401  | Invalid API key.        |
| 500  | Redmine connection failed. |

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/redmine/connect \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://redmine.example.com", "apiKey": "your-redmine-api-key"}'
```

---

### GET /api/redmine/bootstrap

Checks if the application can be bootstrapped using environment variables on the first run.

**Response (200)**

Returns a boolean indicating if bootstrap is possible.

```json
{
  "canBootstrap": true
}
```

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/redmine/bootstrap
```

---

### POST /api/redmine/bootstrap

Connects to Redmine using the `REDMINE_BASE_URL` and `REDMINE_API_KEY` environment variables on the first run of the application.

**Response (200)**

Returns the user object upon successful connection.

**Errors**

| Code | Message                 |
| :--- | :---------------------- |
| 400  | Bootstrap not available. |
| 500  | Redmine connection failed. |

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/redmine/bootstrap
```

## Issue Data and Mutations

### GET /api/issues

Retrieves a paginated list of issues assigned to the current user, with support for filtering and sorting.

**Query Parameters**

- `status` (string): Filter by issue status.
- `priority` (string): Filter by issue priority.
- `search` (string): A search term to filter issues by.
- `sort` (string): The field to sort by.
- `page` (number): The page number for pagination.
- `pageSize` (number): The number of issues per page.

**Response (200)**

Returns a paginated list of issues.

**cURL Example**

```bash
curl -X GET "http://localhost:3000/api/issues?status=New&pageSize=10"
```

---

### GET /api/issues/[id]/status

Retrieves the allowed workflow transitions for a given issue.

**Response (200)**

Returns a list of allowed statuses.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/issues/123/status
```

---

### POST /api/issues/[id]/status

Updates the status of a specific issue.

**Request Body**

```json
{
  "statusId": 5
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/issues/123/status \
  -H "Content-Type: application/json" \
  -d '{"statusId": 5}'
```

---

### POST /api/issues/[id]/comment

Adds a comment to a specific issue.

**Request Body**

```json
{
  "comment": "This is a new comment."
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/issues/123/comment \
  -H "Content-Type: application/json" \
  -d '{"comment": "This is a new comment."}'
```

---

### POST /api/issues/[id]/timelog

Adds a time log entry to a specific issue.

**Request Body**

```json
{
  "hours": 2.5,
  "comments": "Worked on the UI."
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/issues/123/timelog \
  -H "Content-Type: application/json" \
  -d '{"hours": 2.5, "comments": "Worked on the UI."}'
```

---

### GET /api/issues/[id]/github-links

Retrieves the GitHub links associated with a specific issue.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/issues/123/github-links
```

---

### POST /api/issues/[id]/github-links

Adds a new GitHub link to a specific issue.

**Request Body**

```json
{
  "url": "https://github.com/user/repo/pull/1"
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/issues/123/github-links \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/user/repo/pull/1"}'
```

---

### DELETE /api/issues/[id]/github-links/[linkId]

Deletes a specific GitHub link from an issue.

**cURL Example**

```bash
curl -X DELETE http://localhost:3000/api/issues/123/github-links/456
```

---

### POST /api/issues/bulk-status

Performs a bulk update of the status for multiple issues.

**Request Body**

```json
{
  "issueIds": [123, 124, 125],
  "statusId": 5
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/issues/bulk-status \
  -H "Content-Type: application/json" \
  -d '{"issueIds": [123, 124, 125], "statusId": 5}'
```

## Sync and Reporting

### POST /api/sync/manual-pull

Triggers a manual full sync of all data from Redmine.

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/sync/manual-pull
```

---

### GET /api/sync/status

Retrieves the current status of the synchronization service.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/sync/status
```

---

### GET /api/sync/jobs

Retrieves a list of recent synchronization jobs.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/sync/jobs
```

---

### GET /api/reports

Retrieves data for generating reports.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/reports
```

---

### GET /api/internal/activities

An internal endpoint to retrieve activity data.

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/internal/activities
```

---

### GET /api/health

A health check endpoint for monitoring the application.

## Mobile API (Android / Native)

All endpoints under `/api/mobile/v1/*` require `Authorization: Bearer <token>` except pairing.

### POST /api/mobile/v1/pair/connect

Pairs an Android/native client by validating Redmine credentials and issuing a mobile token.

**Request Body**

```json
{
  "baseUrl": "https://redmine.example.com",
  "apiKey": "your-redmine-api-key",
  "deviceName": "Pixel 9"
}
```

**cURL Example**

```bash
curl -X POST http://localhost:3000/api/mobile/v1/pair/connect \
  -H "Content-Type: application/json" \
  -d '{"baseUrl":"https://redmine.example.com","apiKey":"your-redmine-api-key","deviceName":"Pixel 9"}'
```

---

### GET /api/mobile/v1/me

Returns the authenticated mobile user profile and token metadata.

---

### GET /api/mobile/v1/issues

Returns assigned issues for the authenticated mobile user.
Supports `status`, `priority`, `search`, `sort`, `page`, `pageSize`.

---

### GET /api/mobile/v1/issues/[id]

Returns a single issue detail including journals, time entries, and GitHub links.

---

### POST /api/mobile/v1/issues/[id]/comment

Adds a comment to a Redmine issue from mobile and syncs the issue cache.

**Request Body**

```json
{
  "comment": "Posted from Android."
}
```

---

### GET /api/mobile/v1/issues/[id]/github-links
### POST /api/mobile/v1/issues/[id]/github-links
### DELETE /api/mobile/v1/issues/[id]/github-links/[linkId]

Mobile GitHub-link management endpoints aligned with web behavior.

---

### POST /api/mobile/v1/tokens/rotate

Revokes the current token and returns a replacement token.

---

### DELETE /api/mobile/v1/tokens/current

Revokes the current token (mobile logout).

**Response (200)**

```json
{
  "status": "ok"
}
```

**cURL Example**

```bash
curl -X GET http://localhost:3000/api/health
```
