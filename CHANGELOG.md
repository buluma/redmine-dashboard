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
