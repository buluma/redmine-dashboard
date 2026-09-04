# Changelog

All notable changes to this project are documented in this file.

## 2026-09-04 (Latest)

### Added

- **Documentation consolidation** — Rewrapped and consolidated docs to reflect current architecture (`611f862`, `#61`)

### Changed

- **Odysseus calendar integration** — Log Odysseus calendar meetings into recurring-ticket timelogs (`ab7f6a8`, `#60`)

### Security

- **Dependency updates** — Bump release-drafter from 6 to 7, add dependabot.yml for bun, docker, github-actions (`60eb554`, `2918b5f`, `#59`, `#58`)

---

## 2026-08-25

### Changed

- **Package manager migration** — Migrated from npm to bun (`802f629`, `#57`)

---

## 2026-08-24

### Fixed

- **Sync reliability** — Fixed sync completion signal, leader-lock renewal, correlation false-matches, WakaTime timezone/rate-limit bugs (`a6a854b`, `#56`)
- **Dashboard refresh** — Refresh dashboard on `sync.tick.completed` instead of per-issue trickle (`4674834`, `#55`)
- **Sharp vulnerability** — Bumped Next.js to 16.3.2 to pull patched sharp 0.35.3 (`2f5a310`)
- **SSE debounce** — Debounced SSE issue events to stop refresh storms during sync (`deb1706`)
- **Issue reassignment detection** — Detect issues reassigned away from the user during sync (`152a10e`)

### Added

- **Personal tickets pagination** — Paginated personal tickets, filled trend chart bars, fixed hero title size/border on correlation page (`badba66`)

### Changed

- **UI styling cleanup** — Dropped hardcoded light backgrounds from metric-health, metric-ai-insights, dashboard stat/widget cards (`10fabd5`)
- **Heimdall spelling** — Corrected "Heimdal" spelling (single l) in nav label and page title (`e90e99e`)
- **Component backgrounds** — Dropped background from status-select, priority-badge, subject-meta, redmine-collapse (`405172a`)

### Fixed

- **Dark mode patches** — Fixed white background patches in dark mode (`cddae0f`)
- **Liquid glass quick-peek** — Applied liquid-glass styling to issue quick-peek side panel in dark mode (`980e0a9`)
- **Zebra striping** — Removed issue-row zebra striping in dark mode (`67a5bcd`)
- **Hover preview positioning** — Repositioned issue hover preview below row instead of overlapping (`dd49a66`)
- **Noisy logs** — Deduplicated noisy logs/history, fixed white backgrounds in dark theme (`a27f92c`)
- **Personal tickets query** — Capped personal-tickets query at 100 rows (was unbounded) (`de14e59`)

---

## 2026-08-23

### Changed

- **CSS trimming** — Removed dead CSS from globals, components, dashboard-detail, issue-ui, reports-ai (`141048e`, `7cd7c8d`, `436302c`, `3b6ada1`)
- **Navigation styles** — Pruned dead dark-theme CSS and reworked AppNav (`f9dc3b9`, `#54`)

---

## 2026-08-22

### Fixed

- **Constellation background** — Iterative fixes to constellation background intensity, opacity, and readability across dark theme cards (`772152c`, `db0322f`, `5f8376c`, `d1ef95a`, `c6aa5d3`, `be3b41f`, `#48-#53`)
- **Issue queue filters** — Fixed issue queue filter parity + dependency CVE pins (`937dea8`, `#47`)
- **Children sync** — Read children off `issue.children`, not the getIssue wrapper root (`5dc77bd`, `#46`)
- **Subtickets table** — Show status and assignee columns on subtickets table (`39e6f9e`, `#45`)
- **External ticket ingest** — Reject email-parse placeholder subjects (`1d0d966`, `#44`)

---

## 2026-08-14

### Changed

- **Dependency updates** — Bumped js-yaml, swagger-ui-react, dompurify, postcss, fast-uri, undici, next.js, axios, immutable (`94fee71`, `75d7548`, `61e878a`, `8fde66a`, `74ffe95`, `88a70d0`, `88d0573`, `9361507`, `892d948`, `8d67946`, `5b9de51`, `88d0573`, `#32-#43`)

---

## 2026-07-18

### Added

- **Recurring tickets automation** — Automate weekly/monthly support ticket lifecycle with admin UI (`9e21b07`)
- **WakaTime language display** — Show top real language on Top Coding Days, not "Unknown" (`13bc556`)

### Fixed

- **Recurring tickets review findings** — Addressed high-effort review findings (`37584b0`)
- **Issue test helpers** — Extracted `isLocalOnlyIssue` helper, added unit coverage (`f600f4f`)
- **Hybrid local-mirror edits** — Route edits to Redmine, not local-only path (`d563038`)
- **Sync for recurring tickets** — Pull real updates for recurring-tickets' hybrid local mirrors (`553021f`)
- **Recurring tickets form CSS** — Namespaced CSS instead of reusing webhook-form (`83ea15b`)
- **Close/Resolve flow** — Don't strand instances when both Close and Resolve fail (`5177de1`)
- **Parent issue data** — Send parent_issue_id and start/due dates on create (`077b794`)
- **Optional project ID** — Make Redmine Project ID optional, derive from Parent Issue (`6583873`)
- **Webhook form styles** — Styled `.webhook-form/.form-row/.form-group` that were referenced with no CSS (`2dda01e`)

### Changed

- **Slack rendering** — Render Slack mrkdwn instead of dumping raw, apply message styles (`3d54c0c`, `800ebbe`)
- **Dead code removal** — Removed dead code, slack-client dark mode, auth/CSRF e2e (`4f2ea38`)

---

## 2026-07-17

### Fixed

- **Dark mode consistency** — Finished dark-mode color conversions, consistency across shared + AI surfaces (`fba4005`, `a7642d0`)
- **Auth guards** — Added API route auth guard to catch unauthenticated routes (`160d0ed`)
- **CSRF guard** — Folded CSRF guard into proxy.ts (Next 16 renamed middleware) (`2be3ea5`)
- **Security hardening** — Auth gaps, CSRF, race conditions (`544afbb`)
- **AI Summaries crash** — Fixed null-issue crash on AI Summaries Flat view, dark-mode CSS (`1948158`)

### Changed

- **Docker compose consolidation** — Consolidated docker-compose.yml and docker-compose.postgres.yml, cut over to Postgres (`a5c4077`)
- **SQLite PRAGMA** — Use `$queryRawUnsafe` for SQLite PRAGMA statements (`5cd8316`)
- **SQLite locking** — Set WAL journal mode + busy_timeout to stop lock-contention failures (`1881406`)

---

## 2026-07-16

### Added

- **Correlation docs** — Documented correlation catch-all and auto-create ticket env vars (`acf526f`)
- **Auto-create personal tickets** — Auto-create personal tickets for unmatched WakaTime activity (`de2afca`)
- **Timelog sync window** — Widened timelog sync trailing window from 3 to 7 days (`38dbd13`)

### Fixed

- **Catch-all ticket ID** — Pass catchAllIssueId on correlation page's initial server render (`19babc4`)

### Removed

- **Kanban/Gantt views** — Removed Kanban board and Gantt chart views (`29ef9cb`)

### Fixed

- **i18n keys** — Filled missing i18n keys in af/ru/uk locales (`b61bfd5`)
- **Data table alignment** — Aligned data-table headers with rows, added missing noDescription i18n key (`c8c21c9`)

---

## 2026-07-12

### Changed

- **Postgres migration** — Executed on Heimdal, replaced pgloader with arm64-native script (`0264ae1`)

### Fixed

- **Prisma schema** — Widened traces.code to Text after live-data audit, restored postgres schema validity and version migrations (`932591a`, `914fa1e`)

### Docs

- **Schema drift** — Flagged schema drift between sqlite/postgres before pgloader (`e3af022`)

---

## 2026-07-11

### Changed

- **Dashboard refactor** — Extracted IssueQueueCard, useFilterPresets, useDashboardData, DashboardFiltersPanel, useBulkIssueActions, InsightsGrid, OpsAlertsCard, ActivityFeedCard, useIssueFiltering, login screen, hover preview, keyboard shortcuts from page.tsx (`a8d797b`, `fa6642c`, `0ecc995`, `27c656f`, `de5fcc3`, `a105b0d`, `76ef47c`, `f209c71`)
- **IMPROVEMENTS.md** — Marked 1.4 (app/page.tsx split) done (`e92d94a`)
- **Deployment guide** — Caught up deployment guide + codebase summary with recent CI/refactor work (`2770ee8`)

### Fixed

- **Lint warning sweep** — Zero-warning sweep across codebase (150 → 0), locked rule to error (`2379527`, `f93f279`, `c63b3cb`, `50673a9`, `f46a7b7`, `fda5e0c`, `a48f93b`)

### CI

- **CI improvements** — Cancel in-progress runs on superseding push, chain jobs sequentially, moved test/build env vars to job level, repaired prisma schema mismatch (`67035a6`, `2ee7e0d`, `d78d1f3`, `06a9487`, `2a4cdf1`)

### Chore

- **Skill cleanup** — Untracked TODO.md and deploy-heimdal skill, versioned deploy-heimdal skill, pinned container name (`6d99569`, `d1134c5`, `a9a4b62`)

---

## 2026-07-10

### Fixed

- **External API auth** — Centralized key auth, fail closed everywhere (`c380fd6`)
- **AI summaries** — Link local tickets by route id, not #null (`facee87`)
- **Nullable guard** — Guard nullable redmineIssueId in queue selection (`33504af`)

### CI

- **Typecheck & e2e** — Added typecheck and external-api e2e jobs (`6fe47de`)
- **E2E coverage** — Covered external API auth, PATCH, correlation idempotency (`8536046`)

---

## 2026-07-07

### Fixed

- **Type safety** — Made Issue.redmineIssueId nullable (`6a16736`)
- **External API** — Validate API key on ticket detail GET (`afaa20d`)

---

## 2026-07-03

### Added

- **Correlation catch-all** — Catch-all ticket for unlinked WakaTime activity (`1f1dfda`)
- **AI chat local tickets** — Local ticket (L-N) support and time summary tool (`d03d6a5`)
- **UI local tickets** — Show L-N identifier for local tickets (`a02e837`)

---

## 2026-07-02

### Added

- **Sync timelogs alert** — ntfy alert when unmatched WakaTime activity exceeds threshold (`5975704`)
- **Sync timelogs script** — Added sync-timelogs.sh for cron-driven WakaTime correlation apply, moved to scripts/, resolve PROJECT_DIR relative to script's own dir (`488bf80`, `639c23b`, `a22562a`)

### Fixed

- **Sync stale jobs** — Stale-reset orphaned running sync jobs (`b1eff85`)
- **Issue defaults** — Default Issue.spentHours to 0 instead of null (`82d8c4c`)
- **WakaTime aggregation** — Aggregate same-day WakaTime entries when a ticket has multiple linked repos (`c47ce91`)
- **npm audit** — Resolved npm audit findings (`2aab193`)

---

## 2026-06-24

### Fixed

- **Task list checkboxes** — Reverted removal, fixed layout using absolute positioning, aligned GFM checkboxes inline with text (`3a7c384`, `e27ce9b`, `435404b`)
- **Gitignore** — Updated .gitignore (`b1153f6`)

### Added

- **Auth helper** — Added getAuthenticatedUserId for cookie+Bearer fallback (`5bb1988`)
- **Mobile tokens API** — Added POST /api/mobile/tokens for CLI token creation (`b955496`)
- **Bearer auth** — Accept Bearer token on all web API routes (`baf2826`)

---

## 2026-06-22

### Fixed

- **Heading sizes** — Constrained heading sizes in timeline and peek journal markdown (`b659c03`)

---

## 2026-06-21

### Added

- **External API local tickets** — External ticket API supports local/personal tickets (`fedaec9`)
- **WakaTime correlation** — WakaTime↔personal ticket time correlation + auto-log (`f6de9fd`)
- **WakaTime local storage** — Store daily summaries locally with sync and query APIs (`cc2e7e0`)
- **WakaTime filters** — Today/Yesterday filters backed by local DB, all range filters query local DB, manual sync button (`130e860`, `5c0d794`)
- **WakaTime auto-sync** — Auto-sync last 2 days on each poller tick (`b594c2f`)
- **WakaTime batching** — Handle both array and nested summaries response, batch requests by 28 days (`1b5bd23`)
- **WakaTime gauges** — Daily Performance gauge from local DB, daily goal success rate, daily coding goal (5h/day) from local DB (`7401121`, `a8cc69b`, `e32acf0`)
- **WakaTime performance** — Load initial page data from local DB instead of WakaTime API (`dccba3d`)
- **WakaTime date handling** — Use range.end for date key to handle UTC timezone offset, upsert today/yesterday to refresh stale partial data (`b153ee3`, `fd8dc90`)
- **WakaTime sync cap** — Raised sync cap from 365 to 3650 days (`1af13f1`)
- **WakaTime config** — Configurable base URL for Wakapi support (`6fc7d43`)
- **WakaTime data quality** — Don't overwrite higher-quality data on sync (`d41c0a8`)
- **Ticket auto-reassign** — Auto-reassign on resolve/close (`36a696f`)
- **Notifications persistence** — Persist read state in localStorage (`e8c5603`)
- **Personal tickets time logging** — Add time logging for local issues (`68fb267`)
- **Personal tickets assign** — Route assign action through local PATCH API (`4e23834`)
- **Issue journal details** — Render journal details (status/priority changes) in history tab (`5375907`)
- **Personal tickets journal** — Create journal entries on local issue updates (`bf2101e`)
- **Personal tickets status** — Enable status changes on local issues, default allowedStatuses on creation (`07ddbca`, `a88eaf9`)
- **External API PATCH** — Add PATCH endpoint for external ticket updates, fix avg age metric (`ebd5ce3`)

### Fixed

- **LocalStorage tests** — Fixed localStorage test failures + broken time-export WakaTime query (`4521da6`)
- **DB init** — Added --accept-data-loss to db-init prisma push (`12f0941`)
- **Notifications polling** — Skip polling when tab is hidden (`cad414a`)
- **Queue filters** — Status filter pills recompute counters and fail for virtual filters (`76e92e0`)

### Changed

- **Dependency updates** — Bumped undici, dompurify, @opentelemetry/core, @sentry/nextjs, @sentry/profiling-node (`8d0449c`, `cbec0eb`, `bb32d52`)

---

## 2026-06-16

### Fixed

- **Docker SQLite path** — Resolved SQLite DB path ambiguity in standalone Next.js build (`5c20cff`)

---

## 2026-06-14

### Added

- **Webhook reliability** — Auto-disable subscription after 5 consecutive delivery failures (`871a2c8`)

### Fixed

- **Webhook self-heal** — Self-heal WebhookSubscription and WebhookDelivery tables in ensureRuntimeTables (`6216e6d`)

### Chore

- **Cleanup** — Removed tracked db binary, stray root files, and dead test helpers (`3859565`)

---

## 2026-06-13

### Added

- **External API endpoints** — Added /external/logs/digest and /external/sync endpoints (`ef8db4f`)

---

## 2026-06-02

### Changed

- **Vitest** — Bumped vitest from 4.0.18 to 4.1.0 (`90bf1d6`)

---

## 2026-05-17

### Fixed

- **SECURE_COOKIES** — Fixed SECURE_COOKIES blocker (`390ead8`)
- **Middleware** — Added /scripts/ to public prefixes (`47daa6c`)
- **Docker** — Used standalone server, copy public assets (`b93da08`)
- **Mobile** — Replaced isFavorited with Favorite relation query (`160bebf`)
- **Theme** — Deferred localStorage read to useEffect (`49d4b5f`)

### Added

- **Slack features** — Channel mute + keyword search (2.20) (`ce9e5f1`)
- **Rate limiting** — Finished header sweep on mobile + github-links routes (`3721166`)

### Docs

- **Design notes** — Design notes for 1.12 / 1.14 / 1.15, rescope 1.17 from framework choice to Compose hardening (`46cb0ed`, `7749412`)

---

## 2026-05-16

### Added

- **UI polish** — Chip scroll, saved-view active, ChatFab tour, global notification bell (`38c2825`)
- **Ops audit logs** — Audit log filters + CSV export (1.16) (`3b0cd76`)
- **Issue detail relations** — Render relations grouped by type (1.11) (`2a0ead9`)
- **Toast system** — Toast stacking + dismiss-all (2.22), empty-state CTAs (2.10) (`11d1df8`)
- **Rate limiting** — Standardized headers on mutation routes (1.20 partial) (`9b07353`)
- **Security** — Role-gate AI tool execution (1.13) (`6e4e7dc`)
- **Realtime** — SSE event bus + /api/events/stream + dashboard subscriber (1.6) (`337aa90`)
- **Heimdall** — Virtualized log table with @tanstack/react-virtual (`6553fd7`)
- **Dashboard views** — Revived Kanban Board and Gantt views (1.1) (`1a0a1f4`)
- **Metrics** — Prometheus metrics endpoint at /api/metrics/prometheus, exposed webhook/audit/push metrics (`22556d8`, `ade0919`)
- **CI a11y** — Added axe-core e2e gate for dashboard and login (`f70c6af`)

### Changed

- **Telemetry** — Replaced remaining console calls with telemetry, added leader-lock tests, fixed telemetry in db/wakatime, leader-lock and audit test coverage (`27ba368`, `f808e39`, `f31999b`, `25fc309`)
- **RBAC/Rate limiting** — Fixed RBAC hierarchy, rate limit TOCTOU, log retention, leader lock extraction (`a253336`)

### Fixed

- **Type safety** — Removed as-any casts, fixed test mocks (`f31999b`)

### Docs

- **Postgres runbook** — Added Pi migration runbook (1.8) (`db51552`)

---

## 2026-05-06 (Latest)

### Added

- **Dashboard interaction refinements** - Added an issue quick-peek panel for faster issue review without leaving the dashboard. - Added skeleton table loading states to reduce layout jumps while issue data is loading. - Added a sticky filter bar so search, filters, and view controls stay
    available during long dashboard sessions.

- **Dark mode** - Added a theme toggle in the main app navigation. - Added early theme initialization via `public/scripts/theme-init.js` to reduce first-paint theme flicker. - Added a warm neutral dark palette with broad component coverage across
    dashboard, reports, AI, Heimdall, navigation, forms, tables, and issue
    detail surfaces.

- **Login flow** - Added a dedicated `/login` page. - Added auth redirect handling through the new Next.js `proxy.ts` entry point.

### Changed

- **Dashboard refactor and CSS split** - Extracted dashboard types, issue utility helpers, and `MarkdownBlock` into shared modules. - Split the large global/dashboard stylesheet into focused files under
    `app/styles/`. - Removed unused dashboard CSS and tightened TypeScript errors around AI
    status, sync error summaries, and Markdown rendering.

- **Filter and view controls** - Standardized filter-right bar button layout and sizing. - Replaced the browser `prompt()` flow for saving presets with an inline
    input. - Fixed `view-mode-tabs` styling and aligned secondary action buttons with Ops
    page button styling.

- **Navigation and layout** - Hid app navigation for unauthenticated users. - Fixed horizontal overflow on narrower screens. - Renamed legacy `middleware.ts` usage to `proxy.ts` for current Next.js
    routing conventions.

### Fixed

- **Heimdall trend accuracy** — corrected trend calculations and filled dark-mode gaps in Heimdall error views.
- **CSS split boundary** — moved orphaned `@keyframes` lines into the correct stylesheet after the CSS split.

### Security

- **PostCSS advisory mitigation** — added a package override for `postcss >=8.5.10` to address `GHSA-qx2v-qp2m-jg93`.
- **CSRF protection** — added SameSite=strict cookie and CSRF protection for tool-call mutation endpoints (`281fe28`).

## 2026-05-07

### Added

- **Android personal tickets API** — Added local issues API and Android personal tickets screen (`44393db`)
- **Android notifications endpoint** — Added `/api/mobile/v1/notifications/route.ts` for push notification support (`82ae04c`)

### Changed

- **Android UI overhaul** — Overhauled android-native UI to enterprise Material 3 standard (`a553ea5`)
- **Mobile app strategy** — Removed Ionic and Flutter, established android-native as the sole mobile target (`f86a1e2`)

### Fixed

- **ISO timestamp rendering** — Fixed raw ISO timestamps in Android detail screen (due date, updated, note date) (`574c80a`)
- **Theme system** — Consolidated theme system and added system mode support (`1be212c`)

### Security

- **CSRF protection** — Added SameSite=strict cookie and CSRF protection for tool-call mutation endpoints (`281fe28`)

## 2026-05-03

### Changed

- **Dependency maintenance** - Updated `@sentry/webpack-plugin` from 5.1.0 to 5.2.1. - Removed the unused transitive `uuid` dependency through the Sentry webpack
    plugin update.

## 2026-04-23

### Changed

- **Dependency maintenance** — updated transitive `@xmldom/xmldom` from 0.8.12 to 0.8.13.

## 2026-04-20

### Changed

- **Mobile client direction** - Explored alternative mobile packaging/runtime approaches across Electron,
    Ionic, and Apache Cordova. - Updated Converge mobile API client, models, repositories, token storage, screens, and GitHub link tests as part of the mobile direction work.

## 2026-04-19

### Changed

- **Mobile rebrand** - Rebranded the Flutter mobile app from NRCC to Converge. - Renamed the mobile package from `flutter_converge` to `converge`. - Updated mobile docs and defaults to point at the Pi Server / homelab
    endpoint.

- **Mobile auth simplification** - Removed biometric login and the `local_auth` dependency. - Cleaned up biometric leftovers from Android `MainActivity` and the manifest. - Kept mobile authentication centered on simple token auth.

### Fixed

- **Mobile startup resilience** — added error handling around biometric startup paths before removing biometric auth entirely.

## 2026-04-18

### Added

- **Local HTTP session support** — added `SECURE_COOKIES` so local or Pi-hosted HTTP deployments can opt out of secure-cookie-only sessions.

### Fixed

- **SQLite and production build compatibility** - Fixed nullable issue relation handling for SQLite. - Added temporary production `ignoreBuildErrors` handling in `next.config.ts`.

## 2026-04-17

### Added

- **i18n coverage expansion** - Added translation coverage for API docs, chat, Slack, WakaTime, ops alerts, activity feed, issue queue stats, sync status, filters, sorting, search
    source, and saved views. - Added missing translation keys and support scripts for auditing/filling i18n
    files.

### Changed

- **Language support consolidation** - Reduced active languages to English, Ukrainian, Russian, and Afrikaans. - Improved Ukrainian translations for chat and WakaTime sections. - Improved Russian coverage for chat, Slack, and WakaTime.

- **Local development database** - Switched the default Prisma database target to local SQLite
    (`file:./dev.db`) for easier development.

- **Temporarily disabled unfinished board views** - Disabled Jira-style Kanban Board and Gantt Chart views while the implementation remains incomplete.

### Fixed

- **i18n runtime correctness** - Converted ICU plural strings to object-based pluralization for the app i18n
    provider. - Fixed count interpolation in pluralized strings. - Removed a Material icon name from the `notifications.pushOff` translation value.

- **AI chat and search stability** - Fixed the AI search button syntax error. - Made `AiChatMessage.issueId` optional for general chat messages that are not
    tied to a specific issue. - Fixed Prisma create typing for `AiChatMessage` by using unchecked input
    where needed.

- **UI consistency** — matched export button height with primary button sizing.

## 2026-04-16

### Added

- **AI Tool Calls** — Enable the AI assistant to perform real Redmine actions with user confirmation. (`acce1b3`, `38e792a`) - Service: `src/lib/ai-tools.ts` defining 9 tools (get_issue, search_issues, update_status, log_time, etc.) in OpenAI format. - Confirmation loop: Mutating actions (status, time, comments) require
    explicit user approval via inline chat cards. - Multi-provider support: Tool-calling parsing implemented for OpenAI,
    Anthropic, OpenRouter, and Ollama (≥0.5). - New endpoint: `POST /api/chat/execute-tools` to execute confirmed actions
    and summarize results. - UI: Enhanced `ChatInterface` with action badges, confirmation cards, and `slideIn` animations.
- **CSRF protection** — Added SameSite=strict cookie and CSRF protection for tool-call mutation endpoints (`281fe28`).

## 2026-04-14

### Added

- **Full-text search (FTS)** — fast text search across issue subjects, descriptions, and project names. - New route: `GET /api/search?q=` with debounced React component (`FtsSearch`) - Uses PostgreSQL `pg_trgm` similarity matching for fuzzy results - Wired into the main dashboard as a search bar replacement

- **PWA foundation with offline infrastructure** - IndexedDB layer (`lib/offline-db.ts`) via `idb` wrapper: issues cache
    store + sync queue store, LRU eviction (max 500 issues), typed CRUD
    functions - Sync queue engine (`lib/sync-queue.ts`): processes queued mutations (status
    changes, comments, time entries, assignments) on reconnect with exponential
    backoff (max 3 retries) - Service worker (`public/sw.js`) registered client-side for PWA
    installability - PWA manifest (`public/manifest.json`) with standalone display, icons, theme
    color - Offline banner component (`src/components/OfflineBanner.tsx`) — fixed top
    bar visible only when offline - Online status hook (`hooks/useOnlineStatus.ts`) — dual-check: `navigator.onLine` OR ping to `/api/health` — avoids false negatives from
    VPNs/virtual NICs - PWA icons: 192×192 maskable + 512×512 in `public/icons/`

- **RBAC with user roles** — Admin / Editor / User / Viewer role system - New `User` model with `role` field, seeded defaults - Role checking utility (`src/lib/rbac.ts`): `requireRole()`, `hasRole()`, permission matrix - Ops pages gated by role: `/ops/users` (Admin only), `/ops/audit-logs` (Admin/Editor) - Role management UI at `/ops/users`

- **Audit log viewer** — browse user actions, role changes, and internal notes at `/ops/audit-logs` - Client-side filtering by user, action type, date range

- **Docker production setup** — hardened `Dockerfile`, `docker-compose.yml` with healthchecks, backup/restore scripts (`scripts/backup.sh`, `scripts/restore.sh`)

### Changed

- **SQLite development schema aligned with PostgreSQL** — `prisma/schema.dev.sqlite.prisma` updated to match production schema including RBAC, local issues, and audit log fields
- **Back button styling** — Ops sub-pages (`/ops/audit-logs`, `/ops/users`) now use consistent back link styling matching the main dashboard

### Fixed

- **False "offline" banner** — `useOnlineStatus` now uses OR logic (`navigator.onLine || ping succeeds`) instead of requiring both checks to pass. Eliminates false negatives from VPNs, virtual NICs, and Chromium quirks
- **Date hydration mismatch** — all date formatting in ops pages uses consistent `en-GB` locale to prevent server/client rendering differences

## 2026-04-14

### Added

- **Unit test suite expanded** — 14 new test files with 191+ tests passing - Library utilities: auth, crypto, db, rate-limit (33 tests) - API routes: AI endpoints (summarize/categorize/chat), issue routes
    (assign/favorite), Slack integration (40 tests) - React components: ChatFab, AiSearchBar, AiButton, ErrorBoundary,
    ThemeProvider, ThemeToggle (50 tests) - Test infrastructure: Vitest with jsdom environment, @testing-library/react, jest-dom matchers - Test setup file: `src/test-setup.ts` for global test utilities - Vitest configuration updated to support both `.test.ts` and `.test.tsx` files

### Changed

- **Issue model now supports local (non-Redmine) issues** - `redmineIssueId` and `redmineBaseUrl` are now nullable (`Int?`, `String?`) - New `source` field: `"redmine"` or `"local"` (defaults to `"redmine"`) - New `localIssueNumber` field: auto-incremented per-user for local issues - Unique constraint `@@unique([userId, source, localIssueNumber])` for local
    issues - Sync guards prevent local issues from being overwritten by Redmine sync - Migration: `20260414000000_add_local_issue_support`

- **Personal Tickets feature** — create, view, and manage local-only issues that never sync to Redmine - New page: `/personal-tickets` with create form and ticket list - Local issue CRUD routes: `GET/POST /api/issues/local`, `PATCH/DELETE /api/issues/local/[id]` - Issue detail page shows source badge, delete button for local issues

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

- **Project renamed from NRCC (Nasc Redmine Command Center) to Converge** - Reflects evolution from Redmine-only tool to unified operations dashboard - Updated all documentation, page titles, and API references - Branding changes across README.md, docs/, app/, and mobile/

### Added

- **Streamline Logs Integration** — Import and query Streamline application logs in Supabase for troubleshooting. - New Prisma models: `MbuLog`, `ServerSideRulesLog`, `Trace` with optimized
    indexes for time-range and error-level queries. - Import script (`scripts/import-streamline-logs.js`) to parse Ansible-fetched
    JSON logs and upsert into Supabase. - Supports staging/production environments with deduplication via `(id, environment, host)` composite keys. - Documentation: `debugging/README.md` for fetching logs, `scripts/import-streamline-logs.js --help` for import usage.

- **Heimdall — Streamline Log Explorer** (`/heimdall`) - Dashboard showing MBU logs, server side rules logs, and traces in collapsible sections. - Real-time search, log-level filtering, and expandable log cards with duration/CPU/RAM badges. - Errors & Warnings section aggregating issues across all tables. - Refresh button with guard (max 10 records per file) to pull latest logs via `POST /api/heimdall/refresh`.

### Changed

- Added `host` column to `mbu_logs`, `server_side_rules_log`, and `traces` tables. - Enables multi-project separation on shared tables. - Default hosts: staging →
    `streamline.staging.vodacomsa-battery.nasctech.com`, production →
    `streamline.vodacomsa-battery.nasctech.com`. - Override via `STREAMLINE_HOST` env var. - Composite unique key: `(id, environment, host)`.

## 2026-02-26

### Added

- New dedicated issue detail page route at `/issues/[id]` with tabbed sections via `?tab=history|notes|properties|time_entries`.
- Issue detail API endpoint `GET /api/issues/[id]` for enriched issue payloads (journals, GitHub links, time entries, attachments, relations).
- Web attachment previews on issue detail page for image and PDF attachments.
- Restored GitHub link management on issue detail page (add/remove) with section collapse support.
- Redmine text normalization improvements: - `collapse(...)` macro handling; - `<pre><code>` and `<pre>` conversion (raw + escaped forms); - escaped whitespace decoding (`\n`, `\r\n`, `\t`); - source-reference link conversion for `SRC` and `SRC-JOURNAL`.
- Long code/log block rendering improvements: - auto-collapse for larger code blocks; - wrapped long lines to prevent horizontal overflow in markdown containers.
- New Sync Ops console page at `/ops` with: - current sync state snapshot; - recent sync job table with duration/error visibility; - manual full-sync retry action; - health check view (database, Redmine probe, scheduler lock/stale-job count).
- New operational endpoints: - `GET /api/health` - `GET /api/sync/jobs`
- Structured JSON logging utility used by sync lifecycle execution, poller ticks, and mutation/connect/bootstrap routes.
- Bulk issue status updates via `POST /api/issues/bulk-status` with per-issue transition checks and partial-failure reporting.
- GitHub linkage support for issues: - new `IssueGithubLink` model in Prisma/SQLite cache, - `GET/POST/DELETE` endpoints under `/api/issues/[id]/github-links`, - dashboard issue popup UI to add/remove GitHub repo/issue/PR links.
- Android/native mobile API v1 with Bearer-token auth: - pairing endpoint `POST /api/mobile/v1/pair/connect`, - mobile profile/issues/detail/comment routes, - mobile GitHub-link CRUD routes, - token rotation/revoke routes.
- Mobile token management in Sync Ops page with revoke controls.
- Android client integration guide under `docs/mobile/android.md`.
- Flutter client integration guide under `docs/mobile/flutter.md`.
- Dashboard productivity enhancements: - Saved views (status/priority/search/sort snapshots). - Keyboard shortcuts (`/`, `R`, `F`, `G`, `?`, `Esc`). - Ops alerts, recent activity feed, and timelog quick tools (timer + quick
    hour chips).
- Reports enhancements: - Activity heatmap. - Drilldown expansion (`activity_day`). - CSV export for drilldown and report datasets.
- Collapsible sections for `Ops Alerts`, `Recent Activity Feed`, and `Issue Queue`.
- Sentry Logs enabled across client/server/edge initialization with console log forwarding.
- Sentry Metrics test endpoint at `GET /api/sentry-metric-test` for quick metric smoke checks.
- Sentry Logs test endpoint at `GET /api/sentry-log-test` for quick log smoke checks.
- Sentry Profiling support added: - Node profiling via `@sentry/profiling-node` integration on server init, - browser profiling via `browserProfilingIntegration()` + tracing integration, - browser `Document-Policy: js-profiling` response header in Next config.

### Changed

- Branding and page titles updated to `Converge`.
- Polling cadence standardized at 5 minutes.
- Dashboard details now open in a modal popup.
- Main dashboard project filter removed from API/query model.
- Sync header now shows clearer error details and latest sync timestamp.
- Environment/config expanded with `SYNC_JOB_STALE_MS`.
- `db:init` now honors `DATABASE_URL` (SQLite `file:` URLs) via `scripts/db-init.sh`.
- `docker-compose.yml` now: - uses `DOCKER_DATABASE_URL` (default `file:./prisma/dev.db`) to avoid
    collision with local dev `DATABASE_URL`, - mounts `./prisma` to `/app/prisma` for persistent SQLite data, - includes `SYNC_JOB_STALE_MS` and optional Redmine bootstrap env
    passthroughs.
- Introduced shared telemetry utility at `src/lib/telemetry.ts` to unify: - structured app logs, - Sentry logs, - Sentry count/distribution metrics.
- Migrated mutation/ops routes from direct `logEvent` usage to telemetry helpers: - sync manual pull, - issue comment/status/timelog/bulk status, - issue GitHub-link create/delete (web), - mobile issue comment and mobile GitHub-link create/delete.
- Added duration metrics and explicit rate-limit telemetry across migrated routes.

### Fixed

- Enforced authentication before cache access in `GET /api/internal/activities` to prevent unauthorized catalog reads.
- Hybrid issue search now preserves requested `sort` semantics (`updated_desc`, `updated_asc`, `priority`, `due_date`) after local+remote merge.
- Hybrid issue search `total` now reflects full-result semantics (uses remote full count rather than current merged page size).
- Redmine incremental sync failure (`Updated is invalid`) now falls back to full assigned-issues fetch if filter syntax is rejected by server.
- Stale `pending/running` sync jobs are auto-reset after timeout (`SYNC_JOB_STALE_MS`) to avoid stuck sync state.
- Prisma client/schema mismatch guidance improved (regenerate client + restart).
- `db:init` script aligned with default SQLite path (`dev.db`) from `.env.example`.
- Sync Ops page overflow/clipping on narrower desktop widths: - cards now allow shrink (`min-width: 0`), - hero children can shrink within flex layout, - long ops key-value strings wrap safely to prevent horizontal overflow.

### Security

- Removed hardcoded Sentry DSN values from source config files.
- Switched Sentry initialization to environment-based DSN resolution: - `SENTRY_DSN` (server/edge), - `NEXT_PUBLIC_SENTRY_DSN` (client).
- Added DSN placeholders to `.env.example`.

### Documentation

- README rewritten to reflect current API surface, setup, env vars, and troubleshooting.
- Added this changelog for release tracking.
- Added Docker runbook at [DOCKER.md](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/DOCKER.md) with compose lifecycle, persistence, and reset commands.
- Added Docker helper targets in [Makefile](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/Makefile) and documented `make up/down/logs/reset-db`.
- Added telemetry conventions doc at `docs/telemetry.md`.
- Linked telemetry doc from docs index and README.
- Updated deployment guide with Sentry DSN environment variables and security
