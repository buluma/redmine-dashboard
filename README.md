# NRCC - Nasc Redmine Command Center

NRCC is a Next.js + Prisma dashboard for Redmine issues assigned to the signed-in user.
It provides fast local reads from a synced cache, with all final state owned by Redmine.

See [CHANGELOG.md](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/CHANGELOG.md) for release history.

## What It Does

- Connect a user to Redmine using `baseUrl + apiKey`.
- Show assigned issues with filtering, sorting, search, and saved views.
- Update issue status (single issue and bulk selected issues).
- Add comments and time logs from issue detail popup.
- Render issue descriptions/comments/time-log notes as Markdown.
- Run automated sync polling every 60 seconds.
- Run manual full sync with `Force Refresh`.
- Show sync health/status and the latest sync error directly in the header.
- Provide reports page with trends, heatmap, drilldowns, and CSV export.

## Stack

- Next.js App Router
- Prisma Client + SQLite (MVP)
- Zod validation
- In-process sync poller + leader lock

## API Routes

### Session and Connection

- `GET /api/session/me`
  - Returns the current session user or `null`.
- `DELETE /api/session/me`
  - Clears session cookie.
- `POST /api/redmine/connect`
  - Connect Redmine account, create session, trigger full sync.
- `GET /api/redmine/bootstrap`
  - Checks whether first-run `.env` bootstrap can be used.
- `POST /api/redmine/bootstrap`
  - Connects from `REDMINE_BASE_URL` + `REDMINE_API_KEY` on first run.

### Issue Data and Mutations

- `GET /api/issues`
  - Query params: `status`, `priority`, `search`, `sort`, `page`, `pageSize`
- `POST /api/issues/[id]/status`
- `GET /api/issues/[id]/status`
  - Allowed workflow transitions for issue.
- `POST /api/issues/[id]/comment`
- `POST /api/issues/[id]/timelog`
- `POST /api/issues/bulk-status`

### Sync and Reporting

- `POST /api/sync/manual-pull`
- `GET /api/sync/status`
- `GET /api/reports`
- `GET /api/internal/activities`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and set values:

```bash
cp .env.example .env
```

Required:

- `DATABASE_URL` (default: `file:./dev.db`)
- `APP_ENCRYPTION_KEY`
- `SESSION_SECRET`

Optional Redmine bootstrap:

- `REDMINE_BASE_URL`
- `REDMINE_API_KEY`

3. Initialize local SQLite schema:

```bash
npm run db:init
```

4. Start app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

- `DATABASE_URL`: SQLite file path (`file:./dev.db` by default).
- `APP_ENCRYPTION_KEY`: encryption key for stored Redmine API keys.
- `SESSION_SECRET`: HMAC secret for session cookie signing.
- `POLL_INTERVAL_MS`: poll cadence in ms (default `60000`).
- `LEADER_LOCK_TTL_MS`: leader lock TTL in ms (default `90000`).
- `SYNC_JOB_STALE_MS`: stale running/pending job timeout in ms (default `600000`).
- `REDMINE_BASE_URL`: optional first-run bootstrap.
- `REDMINE_API_KEY`: optional first-run bootstrap.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run prisma:generate
npm run db:init
```

## Troubleshooting

### Sync stuck at `running`

- Confirm you are on latest code and restart server.
- Check `GET /api/sync/status`.
- Stale jobs are auto-reset after `SYNC_JOB_STALE_MS`.

### `Updated is invalid` from Redmine

- Some Redmine setups reject strict incremental filter forms.
- Client falls back to a full assigned-issues fetch when this occurs.

### `Unknown argument parentIssueId` (Prisma)

- Prisma client is out of date for current schema.

```bash
npm run prisma:generate
```

Then restart the app.

## Notes

- Redmine API keys are encrypted at rest.
- Decrypted API keys are never sent to the client.
- Sync source of truth is Redmine; DB is an operational cache.
- Rate limits are applied to mutation endpoints.
- Current MVP uses SQLite + in-process poller; production path is Postgres + external scheduler.
