# External Tickets API

REST API for fetching Redmine tickets from external systems like n8n, Zapier, or custom integrations.

## Overview

The External Tickets API provides access to tickets stored in Converge. It supports:
- Fetching by Redmine ID
- Semantic search (subject/description)
- Filtering by status, project, assignee
- Pagination
- Creating local tickets and updating existing ones (see [Write Endpoints](#write-endpoints) below — this is not a read-only API)

## Authentication

### API Key (Recommended for n8n/Zapier)

Pass the API key via header or query parameter:

```bash
# Header
curl -H "X-API-Key: your-api-key" \
  "https://your-server/api/external/tickets"

# Query param
curl "https://your-server/api/external/tickets?api_key=your-api-key"
```

**Setup:**
1. Set `EXTERNAL_API_KEYS` in your `.env` file: ```
   EXTERNAL_API_KEYS=key1,key2,key3 ```
2. Restart the server

### Session (For browser testing)

If no API key is provided, the API accepts authenticated session cookies.

## Endpoints

### List/Search Tickets

```
GET /api/external/tickets
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `api_key` | string | API key for authentication |
| `search` | string | Search in subject and description |
| `redmineId` | number | Get specific ticket by Redmine ID |
| `status` | string | Filter by status name |
| `project` | string | Filter by project name (partial match) |
| `assignee` | string | Filter by assignee name (partial match) |
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset (default: 0) |

**Examples:**

```bash
# Get ticket by Redmine ID
curl "https://your-server/api/external/tickets?redmineId=1234&api_key=your-key"

# Search tickets
curl "https://your-server/api/external/tickets?search=login+bug&api_key=your-key"

# Filter by status
curl "https://your-server/api/external/tickets?status=In+Progress&api_key=your-key"

# Filter by project
curl "https://your-server/api/external/tickets?project=Backend&api_key=your-key"

# Pagination
curl "https://your-server/api/external/tickets?limit=50&offset=0&api_key=your-key"
```

### Get Single Ticket

```
GET /api/external/tickets/{id}
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Local ID (cuid), Redmine issue ID (number), or local issue number in `L-N` / `LN` form |

**Example:**

```bash
# By local ID
curl "https://your-server/api/external/tickets/clx123abc456?api_key=your-key"

# By Redmine ID
curl "https://your-server/api/external/tickets/1234?api_key=your-key"
```

## Write Endpoints

Both require a valid `X-API-Key` — session auth does not work here, unlike the read endpoints above.

### Create a Local Ticket

```
POST /api/external/tickets
```

Creates a local (not Redmine-synced) ticket. Body: `subject` (required), `description`, `tracker`, `priority`. A subject matching an unresolved email-parse placeholder (e.g. `(no subject)`) is rejected with `422` — fix the upstream extraction instead of submitting it. Returns `201` with `{ "ticket": {...} }` on success.

### Update a Ticket

```
PATCH /api/external/tickets/{id}
```

For a local ticket, updates fields directly (`subject`, `description`, `tracker`, `priority`, `projectName`, `status`/`statusId`). For a Redmine-synced ticket, proxies the update through the Redmine API instead (`status`/`statusId`, `notes`, `assignedToId`, `doneRatio`, `priorityId`) and re-syncs the issue afterward — closing or resolving a ticket this way also reassigns it away from its author. `status` accepts a status name (looked up against the status catalog); `statusId` accepts the numeric id directly.

## Response Format

### Success

```json
{
  "tickets": [
    {
      "id": "clx123abc456def789",
      "redmineIssueId": 1234,
      "subject": "Fix login bug with SSO",
      "description": "Users cannot login using SSO authentication...",
      "projectName": "Backend API",
      "tracker": "Bug",
      "status": "In Progress",
      "priority": "High",
      "assignedTo": "John Doe",
      "author": "Jane Smith",
      "dueDate": "2026-04-20T00:00:00.000Z",
      "doneRatio": 50,
      "createdAt": "2026-04-10T09:00:00.000Z",
      "updatedAt": "2026-04-14T12:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### Single Ticket

```json
{
  "id": "clx123abc456def789",
  "redmineIssueId": 1234,
  "subject": "Fix login bug with SSO",
  "description": "Users cannot login using SSO authentication...",
  "projectName": "Backend API",
  "tracker": "Bug",
  "status": "In Progress",
  "priority": "High",
  "assignedTo": "John Doe",
  "author": "Jane Smith",
  "dueDate": "2026-04-20T00:00:00.000Z",
  "doneRatio": 50,
  "createdAt": "2026-04-10T09:00:00.000Z",
  "updatedAt": "2026-04-14T12:00:00.000Z"
}
```

### Error

```json
{
  "error": "Ticket not found"
}
```

## n8n Integration Example

### 1. Create HTTP Request Node

In your n8n workflow, add an HTTP Request node:

- **Method:** GET
- **URL:** `{{$json.baseUrl}}/api/external/tickets`
- **Query Parameters:**
  - `api_key`: Your API key (use a credential)
  - `search`: `{{$json.searchTerm}}` (if using dynamic search)

### 2. Example Workflow

```json
{
  "nodes": [
    {
      "name": "Manual Trigger",
      "type": "n8n-nodes-base_manualTrigger",
      "parameters": {},
      "id": "trigger"
    },
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base_httpRequest",
      "parameters": {
        "method": "GET",
        "url": "https://your-server/api/external/tickets",
        "queryParameters": {
          "api_key": "{{$credentials.externalApiKey}}",
          "status": "In Progress"
        },
        "options": {
          "timeout": 5000
        }
      },
      "id": "http"
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [[{"node": "http"}]]
    }
  }
}
```

### 3. Using Results

Access ticket data in subsequent nodes:

```javascript
// In n8n Expression
$json.tickets[0].subject        // Ticket subject
$json.tickets[0].status        // Ticket status
$json.tickets[0].assignedTo   // Assigned user
$json.total                  // Total matches
```

## Rate Limiting

There is no built-in rate limiting. If you need rate limiting:

1. Use n8n's built-in rate limiting
2. Add your own at proxy level (nginx, Cloudflare)
3. Contact about adding endpoint-specific limits

## Security Notes

1. **API Keys** - Keep them secure, don't expose in client-side code
2. **HTTPS** - Always use HTTPS in production
3. **IP Restrictions** - Consider adding IP allowlists in your firewall
4. **Write endpoints require the API key** - `POST /api/external/tickets` and `PATCH /api/external/tickets/{id}` don't fall back to session auth like the read endpoints do — anyone with the key can create or update tickets, so treat it accordingly
