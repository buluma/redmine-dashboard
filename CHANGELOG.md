# Changelog

All notable changes to this project are documented in this file.

## 2026-02-26

### Added (Ops Hardening)

- New Sync Ops console page at `/ops` with:
  - Current sync state snapshot.
  - Recent sync job table with duration/error visibility.
  - Manual full-sync retry action.
  - Health check view (database, Redmine probe, scheduler lock/stale-job count).
- New operational endpoints:
  - `GET /api/health`
  - `GET /api/sync/jobs`
- Structured JSON logging utility used by:
  - sync lifecycle execution,
  - poller ticks,
  - mutation/connect/bootstrap routes.

### Added

- Bulk issue status updates via `POST /api/issues/bulk-status` with per-issue transition checks and partial-failure reporting.
- GitHub linkage support for issues:
  - new `IssueGithubLink` model in Prisma/SQLite cache,
  - `GET/POST/DELETE` endpoints under `/api/issues/[id]/github-links`,
  - dashboard issue popup UI to add/remove GitHub repo/issue/PR links.
- Android/native mobile API v1 with Bearer-token auth:
  - pairing endpoint `POST /api/mobile/v1/pair/connect`,
  - mobile profile/issues/detail/comment routes,
  - mobile GitHub-link CRUD routes,
  - token rotation/revoke routes.
- Mobile token management in Sync Ops page with revoke controls.
- Android client integration guide under `docs/mobile/android.md`.
- Flutter client integration guide under `docs/mobile/flutter.md`.
- Dashboard productivity enhancements:
  - Saved views (status/priority/search/sort snapshots).
  - Keyboard shortcuts (`/`, `R`, `F`, `G`, `?`, `Esc`).
  - Ops alerts, recent activity feed, and timelog quick tools (timer + quick hour chips).
- Reports enhancements:
  - Activity heatmap.
  - Drilldown expansion (`activity_day`).
  - CSV export for drilldown and report datasets.
- Collapsible sections for `Ops Alerts`, `Recent Activity Feed`, and `Issue Queue`.

### Changed

- Branding and page titles updated to `NRCC - Nasc Redmine Command Center`.
- Polling cadence standardized at 60 seconds.
- Dashboard details now open in a modal popup.
- Main dashboard project filter removed from API/query model.
- Sync header now shows clearer error details and latest sync timestamp.
- Environment/config expanded with `SYNC_JOB_STALE_MS`.

### Fixed

- Redmine incremental sync failure (`Updated is invalid`) now falls back to full assigned-issues fetch if filter syntax is rejected by server.
- Stale `pending/running` sync jobs are auto-reset after timeout (`SYNC_JOB_STALE_MS`) to avoid stuck sync state.
- Prisma client/schema mismatch guidance improved (regenerate client + restart).
- `db:init` script aligned with default SQLite path (`dev.db`) from `.env.example`.

### Documentation

- README rewritten to reflect current API surface, setup, env vars, and troubleshooting.
- Added this changelog for release tracking.
- Added Docker runbook at [DOCKER.md](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/DOCKER.md) with compose lifecycle, persistence, and reset commands.
- Added Docker helper targets in [Makefile](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/Makefile) and documented `make up/down/logs/reset-db`.

### Changed (Docker Reliability)

- `db:init` now honors `DATABASE_URL` (SQLite `file:` URLs) via `scripts/db-init.sh`.
- `docker-compose.yml` now:
  - uses `DOCKER_DATABASE_URL` (default `file:./prisma/dev.db`) to avoid collision with local dev `DATABASE_URL`,
  - mounts `./prisma` to `/app/prisma` for persistent SQLite data,
  - includes `SYNC_JOB_STALE_MS` and optional Redmine bootstrap env passthroughs.

### Added (Observability)

- Sentry Logs enabled across client/server/edge initialization with console log forwarding.
- Sentry Metrics test endpoint at `GET /api/sentry-metric-test` for quick metric smoke checks.
- Sentry Logs test endpoint at `GET /api/sentry-log-test` for quick log smoke checks.
- Sentry Profiling support added:
  - Node profiling via `@sentry/profiling-node` integration on server init,
  - browser profiling via `browserProfilingIntegration()` + tracing integration,
  - browser `Document-Policy: js-profiling` response header in Next config.

### Changed (Telemetry Standardization)

- Introduced shared telemetry utility at `src/lib/telemetry.ts` to unify:
  - structured app logs,
  - Sentry logs,
  - Sentry count/distribution metrics.
- Migrated mutation/ops routes from direct `logEvent` usage to telemetry helpers:
  - sync manual pull,
  - issue comment/status/timelog/bulk status,
  - issue GitHub-link create/delete (web),
  - mobile issue comment and mobile GitHub-link create/delete.
- Added duration metrics and explicit rate-limit telemetry across migrated routes.

### Fixed (UI)

- Sync Ops page overflow/clipping on narrower desktop widths:
  - cards now allow shrink (`min-width: 0`),
  - hero children can shrink within flex layout,
  - long ops key-value strings wrap safely to prevent horizontal overflow.

### Security

- Removed hardcoded Sentry DSN values from source config files.
- Switched Sentry initialization to environment-based DSN resolution:
  - `SENTRY_DSN` (server/edge),
  - `NEXT_PUBLIC_SENTRY_DSN` (client).
- Added DSN placeholders to `.env.example`.

### Documentation

- Added telemetry conventions doc at `docs/telemetry.md`.
- Linked telemetry doc from docs index and README.
- Updated deployment guide with Sentry DSN environment variables and security notes.
