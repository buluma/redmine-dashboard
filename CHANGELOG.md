# Changelog

All notable changes to this project are documented in this file.

## 2026-04-14 (Latest)

### Added

- **Full-text search (FTS)** — fast text search across issue subjects, descriptions, and project names.
  - New route: `GET /api/search?q=` with debounced React component (`FtsSearch`)
  - Uses PostgreSQL `pg_trgm` similarity matching for fuzzy results
  - Wired into the main dashboard as a search bar replacement

- **PWA foundation with offline infrastructure**
  - IndexedDB layer (`lib/offline-db.ts`) via `idb` wrapper: issues cache store + sync queue store, LRU eviction (max 500 issues), typed CRUD functions
  - Sync queue engine (`lib/sync-queue.ts`): processes queued mutations (status changes, comments, time entries, assignments) on reconnect with exponential backoff (max 3 retries)
  - Service worker (`public/sw.js`) registered client-side for PWA installability
  - PWA manifest (`public/manifest.json`) with standalone display, icons, theme color
  - Offline banner component (`src/components/OfflineBanner.tsx`) — fixed top bar visible only when offline
  - Online status hook (`hooks/useOnlineStatus.ts`) — dual-check: `navigator.onLine` OR ping to `/api/health` — avoids false negatives from VPNs/virtual NICs
  - PWA icons: 192×192 maskable + 512×512 in `public/icons/`

- **RBAC with user roles** — Admin / Editor / User / Viewer role system
  - New `User` model with `role` field, seeded defaults
  - Role checking utility (`src/lib/rbac.ts`): `requireRole()`, `hasRole()`, permission matrix
  - Ops pages gated by role: `/ops/users` (Admin only), `/ops/audit-logs` (Admin/Editor)
  - Role management UI at `/ops/users`

- **Audit log viewer** — browse user actions, role changes, and internal notes at `/ops/audit-logs`
  - Client-side filtering by user, action type, date range

- **Docker production setup** — hardened `Dockerfile`, `docker-compose.yml` with healthchecks, backup/restore scripts (`scripts/backup.sh`, `scripts/restore.sh`)

### Changed

- **SQLite development schema aligned with PostgreSQL** — `prisma/schema.dev.sqlite.prisma` updated to match production schema including RBAC, local issues, and audit log fields
- **Back button styling** — Ops sub-pages (`/ops/audit-logs`, `/ops/users`) now use consistent back link styling matching the main dashboard

### Fixed

- **False "offline" banner** — `useOnlineStatus` now uses OR logic (`navigator.onLine || ping succeeds`) instead of requiring both checks to pass. Eliminates false negatives from VPNs, virtual NICs, and Chromium quirks
- **Date hydration mismatch** — all date formatting in ops pages uses consistent `en-GB` locale to prevent server/client rendering differences

## 2026-04-14

### Added

- **Unit test suite expanded** — 14 new test files with 191+ tests passing
  - Library utilities: auth, crypto, db, rate-limit (33 tests)
  - API routes: AI endpoints (summarize/categorize/chat), issue routes (assign/favorite), Slack integration (40 tests)
  - React components: ChatFab, AiSearchBar, AiButton, ErrorBoundary, ThemeProvider, ThemeToggle (50 tests)
  - Test infrastructure: Vitest with jsdom environment, @testing-library/react, jest-dom matchers
  - Test setup file: `src/test-setup.ts` for global test utilities
  - Vitest configuration updated to support both `.test.ts` and `.test.tsx` files

### Changed

- **Issue model now supports local (non-Redmine) issues**
  - `redmineIssueId` and `redmineBaseUrl` are now nullable (`Int?`, `String?`)
  - New `source` field: `"redmine"` or `"local"` (defaults to `"redmine"`)
  - New `localIssueNumber` field: auto-incremented per-user for local issues
  - Unique constraint `@@unique([userId, source, localIssueNumber])` for local issues
  - Sync guards prevent local issues from being overwritten by Redmine sync
  - Migration: `20260414000000_add_local_issue_support`

- **Personal Tickets feature** — create, view, and manage local-only issues that never sync to Redmine
  - New page: `/personal-tickets` with create form and ticket list
  - Local issue CRUD routes: `GET/POST /api/issues/local`, `PATCH/DELETE /api/issues/local/[id]`
  - Issue detail page shows source badge, delete button for local issues

- **Mobile API now accepts string cuids** — `GET /api/mobile/v1/issues/[id]` resolves both numeric Redmine IDs and string cuids for local issues

- **Database connection resilience** — Prisma URL builder adds `pool_timeout=30` and optional `connection_limit` from env; reports route disabled in dev for Sentry

- **API timeout handling** — DB statement timeouts return graceful degraded responses (503) instead of 500 errors across reports, issues list, session, bootstrap, and AI summary count routes

- **Sync job staleness fix** — only `pending` jobs get stale-reset; `running` jobs are reused regardless of duration, eliminating log spam from long-running incremental syncs

- **Flutter mobile UI overhaul** — Material 3 SearchBar, filter chip sorting, hero header with inline badges, flattened section cards, skeleton loading states, improved AI and time tracking sections

### Fixed

- **Mobile `Null is not a subtype of int` crash** — Issue model and all Flutter code updated for nullable `redmineIssueId`; local issues display as `L{number}` vs `#N` for Redmine
- **Local issue edit routing** — `saveEdit()` in detail page now calls `PATCH /api/issues/local/[id]` for local issues instead of Redmine-only PUT route
- **Duplicate favorites filter** — removed redundant FilterChip below sort/mode on mobile; kept AppBar star icon

## 2026-04-13

### Rebrand

- **Project renamed from NRCC (Nasc Redmine Command Center) to Converge**
  - Reflects evolution from Redmine-only tool to unified operations dashboard
  - Updated all documentation, page titles, and API references
  - Branding changes across README.md, docs/, app/, and mobile/

### Added

- **Streamline Logs Integration** — Import and query Streamline application logs in Supabase for troubleshooting.
  - New Prisma models: `MbuLog`, `ServerSideRulesLog`, `Trace` with optimized indexes for time-range and error-level queries.
  - Import script (`scripts/import-streamline-logs.js`) to parse Ansible-fetched JSON logs and upsert into Supabase.
  - Supports staging/production environments with deduplication via `(id, environment, host)` composite keys.
  - Documentation: `debugging/README.md` for fetching logs, `scripts/import-streamline-logs.js --help` for import usage.

- **Heimdall — Streamline Log Explorer** (`/heimdall`)
  - Dashboard showing MBU logs, server side rules logs, and traces in collapsible sections.
  - Real-time search, log-level filtering, and expandable log cards with duration/CPU/RAM badges.
  - Errors & Warnings section aggregating issues across all tables.
  - Refresh button with guard (max 10 records per file) to pull latest logs via `POST /api/heimdall/refresh`.

### Changed

- Added `host` column to `mbu_logs`, `server_side_rules_log`, and `traces` tables.
  - Enables multi-project separation on shared tables.
  - Default hosts: staging → `streamline.staging.vodacomsa-battery.nasctech.com`, production → `streamline.vodacomsa-battery.nasctech.com`.
  - Override via `STREAMLINE_HOST` env var.
  - Composite unique key: `(id, environment, host)`.

## 2026-02-26

### Added

- New dedicated issue detail page route at `/issues/[id]` with tabbed sections via `?tab=history|notes|properties|time_entries`.
- Issue detail API endpoint `GET /api/issues/[id]` for enriched issue payloads (journals, GitHub links, time entries, attachments, relations).
- Web attachment previews on issue detail page for image and PDF attachments.
- Restored GitHub link management on issue detail page (add/remove) with section collapse support.
- Redmine text normalization improvements:
  - `collapse(...)` macro handling;
  - `<pre><code>` and `<pre>` conversion (raw + escaped forms);
  - escaped whitespace decoding (`\n`, `\r\n`, `\t`);
  - source-reference link conversion for `SRC` and `SRC-JOURNAL`.
- Long code/log block rendering improvements:
  - auto-collapse for larger code blocks;
  - wrapped long lines to prevent horizontal overflow in markdown containers.
- New Sync Ops console page at `/ops` with:
  - current sync state snapshot;
  - recent sync job table with duration/error visibility;
  - manual full-sync retry action;
  - health check view (database, Redmine probe, scheduler lock/stale-job count).
- New operational endpoints:
  - `GET /api/health`
  - `GET /api/sync/jobs`
- Structured JSON logging utility used by sync lifecycle execution, poller ticks, and mutation/connect/bootstrap routes.
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
- Sentry Logs enabled across client/server/edge initialization with console log forwarding.
- Sentry Metrics test endpoint at `GET /api/sentry-metric-test` for quick metric smoke checks.
- Sentry Logs test endpoint at `GET /api/sentry-log-test` for quick log smoke checks.
- Sentry Profiling support added:
  - Node profiling via `@sentry/profiling-node` integration on server init,
  - browser profiling via `browserProfilingIntegration()` + tracing integration,
  - browser `Document-Policy: js-profiling` response header in Next config.

### Changed

- Branding and page titles updated to `Converge`.
- Polling cadence standardized at 5 minutes.
- Dashboard details now open in a modal popup.
- Main dashboard project filter removed from API/query model.
- Sync header now shows clearer error details and latest sync timestamp.
- Environment/config expanded with `SYNC_JOB_STALE_MS`.
- `db:init` now honors `DATABASE_URL` (SQLite `file:` URLs) via `scripts/db-init.sh`.
- `docker-compose.yml` now:
  - uses `DOCKER_DATABASE_URL` (default `file:./prisma/dev.db`) to avoid collision with local dev `DATABASE_URL`,
  - mounts `./prisma` to `/app/prisma` for persistent SQLite data,
  - includes `SYNC_JOB_STALE_MS` and optional Redmine bootstrap env passthroughs.
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

### Fixed

- Enforced authentication before cache access in `GET /api/internal/activities` to prevent unauthorized catalog reads.
- Hybrid issue search now preserves requested `sort` semantics (`updated_desc`, `updated_asc`, `priority`, `due_date`) after local+remote merge.
- Hybrid issue search `total` now reflects full-result semantics (uses remote full count rather than current merged page size).
- Redmine incremental sync failure (`Updated is invalid`) now falls back to full assigned-issues fetch if filter syntax is rejected by server.
- Stale `pending/running` sync jobs are auto-reset after timeout (`SYNC_JOB_STALE_MS`) to avoid stuck sync state.
- Prisma client/schema mismatch guidance improved (regenerate client + restart).
- `db:init` script aligned with default SQLite path (`dev.db`) from `.env.example`.
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

- README rewritten to reflect current API surface, setup, env vars, and troubleshooting.
- Added this changelog for release tracking.
- Added Docker runbook at [DOCKER.md](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/DOCKER.md) with compose lifecycle, persistence, and reset commands.
- Added Docker helper targets in [Makefile](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/Makefile) and documented `make up/down/logs/reset-db`.
- Added telemetry conventions doc at `docs/telemetry.md`.
- Linked telemetry doc from docs index and README.
- Updated deployment guide with Sentry DSN environment variables and security notes.
