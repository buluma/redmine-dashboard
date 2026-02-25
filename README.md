# Redmine Assigned Issues Dashboard

A Next.js + SQLite dashboard for Redmine issues assigned to the current user.

## Features

- Connect to Redmine with per-user API key.
- Cached issue list for assigned issues with filters, sorting, and search.
- Update issue status from the table.
- Post issue comments from detail drawer.
- Add time logs (`hours + activity + comment + spent_on`).
- Automated polling every 60 seconds.
- Manual full refresh (`Force Refresh`) to sync all assigned issues immediately.

## Stack

- Next.js App Router
- Prisma Client (SQLite)
- Zod validation
- In-process poller with leader lock table

## API Endpoints

- `POST /api/redmine/connect`
- `GET /api/session/me`
- `DELETE /api/session/me`
- `GET /api/issues`
- `POST /api/issues/:id/status`
- `GET /api/issues/:id/status` (allowed transitions for the issue)
- `POST /api/issues/:id/comment`
- `POST /api/issues/:id/timelog`
- `POST /api/sync/manual-pull`
- `GET /api/sync/status`
- `GET /api/internal/activities`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and update secrets:

```bash
cp .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Initialize SQLite schema:

```bash
npm run db:init
```

This initializes `prisma/dev.db` (the SQLite file used by Prisma for this project).

5. Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker compose up --build
```

The app is served at [http://localhost:3000](http://localhost:3000).

## Tests and Checks

```bash
npm run lint
npm run test
npm run build
```

## Notes

- Redmine API key is encrypted at rest with `APP_ENCRYPTION_KEY`.
- Session is an HMAC-signed HTTP-only cookie.
- Sync jobs are stored in `SyncJob` and summarized in `SyncState`.
- Polling cadence is 60 seconds (`POLL_INTERVAL_MS=60000`).
- Mutation endpoints include basic per-user rate limits.
- This MVP uses local SQLite and in-process polling; production migration can move to Postgres + external scheduler.
