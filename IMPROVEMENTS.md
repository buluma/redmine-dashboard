# Converge — Functional & UI/UX Improvement Backlog

Date: 2026-05-16
Scope: full repo walk (`app/`, `src/`, `prisma/`, `mobile/`, `messages/`).

This list complements `TODO.md`. `TODO.md` tracks shipped + immediate next work; this doc captures opportunities surfaced by code review — broken/dormant features, debt, and UX rough edges. Each item lists evidence (file:line) and a suggested next step.

---

## 0. Status (2026-05-16 working session)

Completed during this session:

| Item | Status | Where |
|------|--------|-------|
| 1.3 Telemetry sweep (`console.*` → `trackFailure` in `app/api/`) | ✅ done | 42 calls across 30 route files |
| 1.4a Extract `useDashboardSavedViews` | ✅ done | `src/hooks/useDashboardSavedViews.ts` |
| 1.4b Extract `usePageSize` (filterPresets stayed inline) | ✅ done | `src/hooks/usePageSize.ts` |
| 1.4c Extract `DashboardHero` | ✅ done | `src/components/dashboard/DashboardHero.tsx` |
| 1.4d Extract `IssueQueueRow` (row JSX, ~210 lines) | ✅ done | `src/components/dashboard/IssueQueueRow.tsx` |
| 1.5a Extract `InternalNotesSection` + `useInternalNotes` | ✅ done | `src/components/issue-detail/InternalNotesSection.tsx`, `src/hooks/useInternalNotes.ts` |
| 1.5b Extract `AttachmentsSection` | ✅ done | `src/components/issue-detail/AttachmentsSection.tsx` |
| 1.5c Extract `GithubLinksSection` (Relations not rendered today — no JSX to extract) | ✅ done | `src/components/issue-detail/GithubLinksSection.tsx` |
| 1.7 Streamline log retention | ✅ already shipped | `pruneOldLogs` in `src/lib/streamline-log-poller.ts:34`; env `STREAMLINE_LOG_RETENTION_DAYS` (default 7) |
| 1.9 Bulk actions beyond status | ✅ done | new `POST /api/issues/bulk-update`, `bulkIssueUpdateSchema`; toolbar gets Bulk Priority + Mark 100% |
| 2.1 Compact dashboard hero | ✅ done | 3 primary cards default; "All metrics" toggle persisted to `nrcc.showAllMetrics.v1` |
| 2.2 Mobile nav overflow menu | ✅ done | 4 primary items inline + `⋯ More` bottom sheet (`src/components/AppNav.tsx`) |
| 2.3 Hide one-tab view-mode strip | ✅ done | `app/page.tsx` — Kanban/Gantt JSX, imports, `viewMode` state, `handleBoardDrop` removed |
| 2.4 Anchor hover tooltip away from cursor | ✅ done | 300 ms delay, edge-aware flip, fade animation, `prefers-reduced-motion` respected |
| 2.5 Keyboard nav in issues table | ✅ done | rows `tabIndex={0}` + `↑/↓` move focus, `Enter` opens peek, `Shift+Enter` opens full page, `Space` toggles selection |
| 2.6 Collapse bulk toolbar when empty | ✅ done | one-line hint at zero selection; full toolbar on ≥1 selected |
| 2.7 + 2.8 a11y on status dot + emoji signals | ✅ done | `role="img"`/`aria-label` on dot; emoji wrapped in `aria-hidden`; queue-stat spans labelled |
| 2.12 Prev/next nav in Quick Peek | ✅ done | `↑/↓` and `j/k` cycle filtered issues; inline up/down buttons next to Full page |
| 2.18 Chart drill-down audit | ✅ already shipped | `app/reports/page.tsx:149` drilldown state + `onClick` on every chart |
| 2.24 Focus rings + reduced motion | ✅ done | global `:focus-visible` ring; global `prefers-reduced-motion` rule shortening animations/transitions |
| 2.25 Page size selector | ✅ done | 20/50/100 inline with pagination; persisted to `nrcc.pageSize.v1` |
| 1.1 Kanban + Gantt revive | ✅ done | view-mode tab strip restored; KanbanBoard wired to `/api/issues/bulk-status`; GanttChart consumes `visibleIssues` mapping |
| 1.22 axe-core CI gate | ✅ done | `@axe-core/playwright`; `e2e/a11y.spec.ts` scans `/` + `/login`; CI `a11y` job in `.github/workflows/ci.yml` |
| Hygiene: tests for new hooks + components | ✅ done | 47 tests in `src/hooks/__tests__/`, `src/components/dashboard/__tests__/`, `src/components/issue-detail/__tests__/` (403/403 suite pass) |
| Hygiene: setState-in-effect lint | ✅ done | hydration-load comment + scoped disable in `usePageSize.ts:28`, `useDashboardSavedViews.ts:47` |
| 1.6 SSE real-time updates | ✅ done | `src/lib/event-bus.ts` in-process emitter; `app/api/events/stream/route.ts` SSE with 25s heartbeat + per-user filter; `src/hooks/useEventStream.ts`; `src/lib/sync.ts` emits `issue.created`/`issue.updated`; dashboard subscribes (poll kept as backstop) |
| 1.8 Pi Postgres migration runbook | ✅ done | `docs/POSTGRES_MIGRATION.md` (fresh-sync + pgloader strategies, rollback, verification checklist); `DOCKER.md` cross-links it |
| 2.19 Heimdall log virtualization | ✅ done | `@tanstack/react-virtual`; `VirtualizedLogList` with `measureElement` variable-height; replaces 100-row cap in `app/heimdall/heimdall-logs-client.tsx` |
| 1.13 AI tool-call RBAC | ✅ done | `TOOL_ROLE_REQUIREMENTS` per-tool in `src/lib/ai-tools.ts`; `getRequiredRole` defaults unknown tools to ADMIN; `executeTool` gates on `getUserRole`; 8 new tests |
| 1.20 Rate-limit headers (partial) | ⏳ done on 6 routes | `rateLimitHeaders` helper + `jsonError(..., headers)` overload; wired into `bulk-status`, `bulk-update`, `[id]/status`, `[id]/comment`, `[id]/timelog`, `sync/manual-pull`. Mobile + github-links still bare |
| 2.10 Empty states with CTAs | ✅ done | `.empty-state` block on ops-alerts, status-mix, priority-mix; "Force refresh" link-button in ops-alerts empty path |
| 2.22 Toast stacking + dismiss-all | ✅ done | `MAX_VISIBLE=3` newest-first; `+N more` pill + Clear all; `clearAll()` on context; aria-live polite |
| 1.11 Issue relations on detail | ✅ done | `RelationsSection` (grouped by type) at `src/components/issue-detail/RelationsSection.tsx` |
| 1.16 Audit log filters + export | ✅ done | action/entity/text filters + CSV export at `app/ops/audit-logs/audit-logs-view.tsx` |
| 2.11 Filter chip overflow scroll | ✅ done | `.chip-row` `flex-wrap: nowrap` + scroll-snap-x on ≤540px |
| 2.13 ChatFab tour pulse | ✅ done | `chat-fab-pulse` keyframes + `.chat-fab-tour` tooltip; dismiss persisted in `nrcc.chatFab.tourSeen.v1` |
| 2.14 Theme tri-state | ✅ already shipped | `ThemeProvider` already supports light/dark/system |
| 2.16 Saved view active styling | ✅ done | filled accent background + ✓ check marker; both themes |
| 2.21 Wakatime date presets | ✅ already shipped | `WAKATIME_RANGE_OPTIONS` at `app/wakatime/wakatime-client.tsx:450` |
| 2.23 Notification bell global | ✅ done | moved `NotificationsPanel` into `app/layout.tsx` (auth-gated) as fixed top-right bell |
| 1.20 Rate-limit headers (closeout) | ✅ done | mobile + github-links routes now use `rateLimitHeaders` on 429: comment, internal-notes/[noteId], github-links + [linkId], pair/connect, web github-links + [linkId] |
| 2.20 Slack channel + keyword filter | ✅ done | keyword search across text + author cached name; per-channel mute persisted to `nrcc.slack.mutedChannels.v1`; muted channels pause auto-refresh + show banner |
| Design pass: 1.12 / 1.14 / 1.15 | ✅ done | `docs/DESIGN_NOTES.md` with contracts, data models, sequencing, and open questions for each |

Verification at session end:
- `npx tsc --noEmit` → 2 pre-existing errors in `mobile/v1/reports` only.
- `npm test --run` → **356 / 356 pass**.
- `npx eslint`: big pages 3 → 3 errors (no regression); new hooks add 2 `setState-in-effect` violations matching the original pattern already in the repo.

Deferred (need approval before touching):

| Item | Status | Blocker |
|------|--------|---------|
| 1.4 page.tsx full split | partial | core extractions shipped (1.4a–d); deeper split touches reducer migration + AI/notif/preset wiring |
| 1.5 issue detail full split | partial | comment-post form + history/notes/properties timelines remain inline (tied to `performAction`); each is small |
| 1.18 Saved views single source of truth | blocked | client `SavedView` shape (`statusFilter`/`priorityFilter`/`sort`) ↔ server Prisma model (`status`/`sortBy`/`sortOrder`/`priorityIds[]`) diverge; needs schema migration or wider field reshape |

After-phase items (1.1 Kanban/Gantt revive, 1.6 SSE, 1.8 Postgres on Pi, 1.12 offline conflicts, 2.19 log virtualization, etc.) untouched.

---

## 1. Functional Improvements

### 1.1 Re-enable Kanban Board and Gantt views — High ✅ done
- **Evidence:** `app/page.tsx:1656-1687` — Kanban + Gantt view-mode buttons and renderers are commented out (`temporarily disabled`). Only the `list` tab actually renders, so `view-mode-tabs` shows a single button with no purpose.
- **Impact:** Two TODO items in `TODO.md` ("Jira-Style Kanban Board", "Interactive Gantt Chart View") already have component scaffolding (`src/components/KanbanBoard.tsx`, `src/components/GanttChart.tsx`).
- **Action:** Either restore both with working drag-and-drop status updates, or remove `KanbanBoard`/`GanttChart` imports and the `viewMode` state entirely. Half-wired UI is worse than no UI.

### 1.2 Finish drag-to-reorder in issues table — Medium
- **Evidence:** `app/page.tsx:1781-1786` — `onDrop` handler is `// Reorder logic would go here`. Drag handle visually exists; nothing happens on drop.
- **Action:** Either implement local reorder + persist to a `sortIndex` field, or remove the `drag-handle` column. Currently misleads users.

### 1.3 Replace remaining raw `console.*` calls with telemetry — High ✅ done (app/api/)
- **Evidence:** 80 hits across `app/api/` and a few client files. CLAUDE.md mandates `src/lib/telemetry.ts`.
- **Files (sample):** `app/api/ai/*`, `app/api/chat/*`, `app/api/external/tickets/*`, `app/api/issues/*`, `app/api/internal/notes/*`.
- **Action:** Sweep with `grep -rEn "console\.(log|warn|error)" app/ src/`; for each, replace with `trackInfo`/`trackFailure`. Add an ESLint rule (`no-console`) once the floor is clean.

### 1.4 Reduce `app/page.tsx` complexity — High ⏳ partial (1.4a–d shipped)
- **Evidence:** 1996 lines, 55 `useState` hooks, multiple memos + effects in a single client component.
- **Symptoms:** prop drilling avoided by stacking state; harder TDD; hard to keep effects in sync.
- **Action:** Extract `useDashboardQueue()`, `useSavedViews()`, `useFilterPresets()`, `useIssueSelection()` hooks. Replace clusters of `useState` with `useReducer` for filter/view state. Split queue table to its own component.

### 1.5 Reduce `app/issues/[id]/page.tsx` complexity — High ⏳ partial (1.5a–c shipped)
- **Evidence:** 2117 lines. Mix of: rendering, comment posting, GitHub link mgmt, time entries, allowed statuses, edit mode, offline queue, AI panel.
- **Action:** Sectionalize: `<IssueHeader>`, `<IssueDescription>`, `<IssueComments>`, `<IssueAttachments>`, `<IssueRelations>`, `<IssueGithubLinks>`, `<IssueTimeLog>`. Each owns its own fetch/mutation hook.

### 1.6 Real-time updates (SSE/WebSocket) — Medium (already in TODO) ✅ done
- **Evidence:** `TODO.md` flags. Today the page polls every `POLL_INTERVAL_MS = 90_000`. After a Redmine update users wait up to 90 s.
- **Action:** Add `/api/events/stream` SSE endpoint fed by the poller. Client subscribes for delta events (`issue.updated`, `issue.created`). Keep polling as fallback.

### 1.7 Streamline log retention / pruning — High (TODO carry-over) ✅ already shipped
- **Evidence:** `TODO.md` notes unbounded growth, Pi disk at 73%.
- **Action:** Add Prisma deleteMany cron in `src/lib/streamline-log-poller.ts` keyed on `createdAt < now() - 30d` (configurable env). Wire metric `streamline_log_pruned`.

### 1.8 Migrate Pi from SQLite to PostgreSQL — High (TODO carry-over) ✅ runbook done
- **Evidence:** SQLite locks under concurrent writes. `docker-compose.postgres.yml` already prepared.
- **Action:** Document migration runbook (pg_dumpall import? prisma migrate deploy with new DATABASE_URL?). Test on staging Pi first.

### 1.9 Bulk actions beyond status — Medium ✅ done
- **Evidence:** `app/page.tsx:1456-1483` — bulk toolbar only exposes `bulkStatusId`.
- **Action:** Add bulk priority, bulk assignee, bulk add-watcher, bulk close-as-done. Backend: `POST /api/issues/bulk` with array of updates.

### 1.10 Filter presets are client-side only — Medium
- **Evidence:** `app/page.tsx:1559-1617` writes preset to local `filterPresets` state.
- **Action:** Persist via `/api/saved-views` schema (or new `/api/filter-presets`). Roles-aware so admins share presets.

### 1.11 Issue dependencies / blockers visual — Low ✅ done (flat grouped list)
- **Evidence:** `Relation` data fetched but rendered as a flat list on detail page.
- **Action:** Render dependency tree (parent / blockers / blocks) as collapsible graph or breadcrumb. Helps planning.

### 1.12 Offline conflict resolution — Medium ⏳ design landed (see `docs/DESIGN_NOTES.md`)
- **Evidence:** `src/hooks/useOfflineAction.ts` queues mutations; on flush there's no UI when the server rejects a stale write.
- **Action:** Add "conflict resolution" modal: server-side `409` returns latest state, user picks merge / keep mine / discard.

### 1.13 AI tool-call permission scoping per role — Medium ✅ done
- **Evidence:** `src/lib/ai-tools.ts` dispatcher executes mutating tools after client confirmation, but no RBAC check on which tools each role can invoke.
- **Action:** Add `requiredRole` field to each tool definition, check against session role in `/api/chat/execute-tools`.

### 1.14 Per-user push notification preferences — Medium ⏳ design landed (see `docs/DESIGN_NOTES.md`)
- **Evidence:** `app/api/push/*` exists but no preference matrix (assigned-only vs. all updates vs. mentions only).
- **Action:** Add `NotificationPreference` model + settings page under `/ops/preferences`.

### 1.15 Webhook retry config + delivery transparency — Medium ⏳ design landed (see `docs/DESIGN_NOTES.md`)
- **Evidence:** `app/webhooks/deliveries/page.tsx` shows history; no UI to configure retries/backoff or replay individual failed deliveries.
- **Action:** Per-subscription `retryStrategy`, `maxAttempts`. Replay button on `deliveries` page.

### 1.16 Audit log filtering and export — Low ✅ done
- **Evidence:** `app/ops/audit-logs/audit-logs-view.tsx` (154 lines) — verify search/filter is present; otherwise add actor/action/date filters and CSV export.

### 1.17 Mobile app — harden Compose client to production — High (rescoped 2026-05-17)

Original framing ("Flutter broken, pick PWA/Capacitor/Flutter") is stale.
The team has already shipped `mobile/android-native` — a native Kotlin +
Jetpack Compose client (~6469 LOC, 27 .kt files) wired against 41
endpoints under `/api/mobile/v1/*`, with Room-backed offline queue
(`OfflineSyncWorker`), Firebase Messaging, encrypted `SecureTokenStore`,
CommonMark+GFM rendering, Coil 3 images, and Sentry. The old
`mobile/converge` Flutter tree is no longer in the repo.

Two clients run in parallel: the web PWA (anyone-with-a-browser) and
the native Android app (team-member power tool). 1.17 is now about
**production-hardening the existing Compose app**, not about choosing
a framework.

Open subtasks (a–h):

- **1.17a Android CI job** — add `assembleDebug + lintDebug + ./gradlew test`
  to `.github/workflows/ci.yml`. A backend schema change that breaks
  `ConvergeApi.kt` must be caught at PR time, not in Android Studio.
- **1.17b Release build hardening** — `buildTypes.release {
  isMinifyEnabled = true; isShrinkResources = true }` in
  `app/build.gradle.kts`; ProGuard rules for Retrofit/Moshi/OkHttp/Room;
  signing config; release-flavour `network_security_config` that drops
  cleartext; refuse-to-launch guard when `BuildConfig.DEFAULT_SERVER_URL`
  starts with `10.0.2.2` or `http://` on the release variant.
- **1.17c Sentry profile split** — flip `send-default-pii` to `false`,
  drop `traces.sample-rate` to `0.1`, screenshots crash-only, narrow
  `user-interaction.enable` for release. Debug build keeps current
  settings. Customer Redmine subjects must not leak.
- **1.17d Test floor** — JVM unit tests for `ConvergeRepository`,
  `SecureTokenStore`, `OfflineSyncWorker`; one Compose UI test per
  primary screen (IssueList, IssueDetail, Settings).
  Current count: 0.
- **1.17e BiometricPrompt gate** — gate `SecureTokenStore.readToken`
  with `androidx.biometric:biometric` so a stolen unlocked device
  cannot drain the bearer.
- **1.17f Adaptive + round icons** — current manifest references only
  `ic_launcher_foreground`. Add adaptive XML + round mipmap. Required
  for Play submission.
- **1.17g Wire 1.12 conflict contract into `OfflineSyncWorker`** —
  once the server adds `expectedUpdatedAt` checks (see 1.12),
  `OfflineSyncWorker.dispatch` must surface the 409 + serverState to
  the same conflict store the PWA uses.
- **1.17h Token lifecycle UX** — verify Settings exposes both rotate
  (`/api/mobile/v1/tokens/rotate`) and revoke
  (`/api/mobile/v1/tokens/current` DELETE). Confirm push subscriptions
  are cleared server-side on rotate.

Bonus gaps not in a–h but worth tracking:

- `ConvergeApplication` is a one-line stub — needs a real `onCreate`
  for WorkManager init, Sentry options, ImageLoader config.
- AI endpoints (`/api/ai/summarize`, `/api/ai/categorize`) are not
  prefixed with `/api/mobile/v1/*` and share web rate limits. Either
  add mobile-prefixed aliases or document the asymmetry.
- Local-only issues are silently read-only on mobile (per README) —
  add a banner instead of dead controls.
- `versionCode=1, versionName=0.1.0` — Play submission needs a
  versioning policy.

### 1.18 Saved-view sync across devices — Low ⛔ blocked on Prisma schema mismatch
- **Evidence:** `app/page.tsx:71` — `SAVED_VIEWS_KEY = "nrcc.savedViews.v1"` (localStorage), although a server-side panel exists (`SavedViewsPanel`). Two sources of truth.
- **Action:** Drop localStorage path, server-side only with optimistic update.

### 1.19 Search-mode UX is muddled — Low ⛔ deferred
- **Evidence:** `app/page.tsx:1216-1222` — three modes (`local | hybrid | fts`) plus a separate FTS panel toggle and AI search panel toggle. Easy to land in the wrong mode.
- **Action:** Single segmented search bar with mode chips; remove separate FTS panel and AI panel toggles in favour of an inline mode switch.

### 1.20 Rate-limit headers on mutation routes — Low ✅ done
- **Evidence:** `src/lib/rate-limit.ts` exists but uncertain whether routes return `Retry-After` / `X-RateLimit-*` headers.
- **Action:** Verify and standardize across all mutation endpoints.

### 1.21 i18n parity — Low
- **Evidence:** `messages/` has `af, en, ru, uk` only. `translate-af.js` exists (one-off?). `i18n:audit` script available.
- **Action:** Run `npm run i18n:audit`. Decide on supported locales, remove orphan translation files.

### 1.22 No accessibility CI gate — Medium
- **Evidence:** `package.json` deps have no `axe-core`/`@axe-core/playwright`/`pa11y`. CLAUDE.md emphasizes a11y as part of testing.
- **Action:** Add `@axe-core/playwright`; one e2e test scans the dashboard and issue detail pages, failing on serious violations.

---

## 2. UI / UX Improvements

### 2.1 Dashboard hero is dense — High ✅ done
- **Evidence:** `app/page.tsx:1116-1166` — seven metric cards rendered side-by-side. On laptops the cards squeeze; on mobile they stack into a long ribbon before content.
- **Action:** Show three primary KPIs by default (`Open`, `Risk`, `Delivery Health`) and tuck Stale/Blocked/AI behind an "All metrics" toggle. Or move to a tabbed compact pill row.

### 2.2 Mobile nav truncates labels — High ✅ done
- **Evidence:** `AppNav.tsx:277-325` collapses to a bottom bar on `≤768px`. With 11 nav items + 0.65 rem labels, items overlap on small phones.
- **Action:** Switch to a "more" overflow menu after 5 items. Or a slide-up sheet triggered by a single hamburger button on mobile.

### 2.3 View-mode tabs render a single tab — High ✅ done
- **Evidence:** `app/page.tsx:1652-1664` — only `list` button is active; Kanban and Gantt are commented out. Tabs container is empty visual noise.
- **Action:** Hide the `.view-mode-tabs` wrapper while only one view exists. Bring back once 1.1 is resolved.

### 2.4 Mouse-following hover tooltip blocks the row — Medium ✅ done
- **Evidence:** `app/page.tsx:1937-1969` — preview tooltip anchors to `clientX/clientY + 15px`, follows the cursor and overlays whatever is beneath. Hard to read while moving cursor.
- **Action:** Anchor tooltip to the row's right edge (or to a portal). Add 300ms delay before show; instant hide. Add `pointer-events: none` (likely already there but verify).

### 2.5 Keyboard navigation in the issue table — Medium ✅ done
- **Evidence:** `app/page.tsx:1754-1869` — rows are clickable `<tr>` with no `tabIndex` or arrow-key handling. Power users can't move row-by-row.
- **Action:** Make rows focusable, add `↑/↓` to move, `Enter` to open quick peek, `Shift+Enter` to open full page. Update `ShortcutHelp`.

### 2.6 Bulk toolbar always visible — Low ✅ done
- **Evidence:** `app/page.tsx:1456-1483` — toolbar renders even when zero rows selected (`Selected: 0`). Steals vertical space.
- **Action:** Collapse to a compact "Select rows to bulk-edit" hint; expand only when `selectedIssueIds.length > 0`.

### 2.7 Color-only state signals — Medium (a11y) ✅ done
- **Evidence:** `app/page.tsx:1844` — `.status-dot` colored circle with no text; `urgency-pill` next to subject. Status text is in the select but the dot reading is colour-only for screen readers.
- **Action:** Wrap dot with `aria-label="In progress"`. Add a tiny status icon alongside (✓ done, ▶ in-progress, ⏸ blocked) so color isn't the only signal.

### 2.8 Emoji as primary signal — Medium (a11y) ✅ done
- **Evidence:** Quick-filter buttons (`app/page.tsx:1495-1524`) use `🟢/🔵/🛑/⚠️` as the visual anchor; queue stats use `⚠️ 🛑 🕐`. Screen readers may announce them inconsistently.
- **Action:** Pair every emoji with a text label and `aria-hidden="true"` on the glyph. Already partially done; sweep for consistency.

### 2.9 Loading state inconsistencies — Low ⏳ partial
- **Evidence:** `SkeletonTable` used on dashboard; other pages (`reports`, `wakatime`, `slack`, `heimdall`) likely use spinners or nothing.
- **Action:** Standardize loading skeletons across pages so layout doesn't shift.

### 2.10 Empty states are bare text — Low ✅ done
- **Evidence:** `app/page.tsx:1337` — `No active risk alerts.`; `1263` — `No status data yet.`
- **Action:** Add a small icon + suggestion CTA ("Sync from Redmine", "Create your first issue").

### 2.11 Filter chips overflow narrow viewports — Low ✅ done
- **Evidence:** `app/page.tsx:1262-1273` — `chip-row` of status chips. With 8+ statuses it wraps multiple lines.
- **Action:** Horizontal scroll with momentum, or "show all / show less" toggle past N chips.

### 2.12 Quick Peek lacks prev/next navigation — Medium ✅ done
- **Evidence:** `IssueQuickPeek.tsx` — single issue at a time, `Escape` to close.
- **Action:** Add `j / k` (or `←/→`) to move to prev/next issue in the filtered list without closing the panel. Already common in Linear/Jira.

### 2.13 ChatFab discoverability — Low ✅ done
- **Evidence:** `src/components/ai/ChatFab.tsx` floats over content; not announced to first-time users.
- **Action:** First-run tooltip / pulse animation tied to a `dismissedTour` flag. Reuse it later for new feature highlights.

### 2.14 Theme toggle: add "system" option — Low ✅ already shipped
- **Evidence:** `ThemeToggle.tsx` likely binary light/dark.
- **Action:** Tri-state `light | dark | system` honoring `prefers-color-scheme`.

### 2.15 Login page split — Low ⛔ deferred
- **Evidence:** `app/login/page.tsx` 305 lines; mixes manual connect + env bootstrap + error display.
- **Action:** Wizard with steps (connect → verify → confirm). Two components.

### 2.16 Saved view active-state styling — Low ✅ done
- **Evidence:** `app/page.tsx:1226-1237` — active view id passed; verify the rendered chip clearly highlights and that re-applying the same view re-syncs filters.
- **Action:** Visual treatment for the active saved view (filled chip, check icon).

### 2.17 Inline edit other columns in issues table — Low ⛔ deferred
- **Evidence:** `app/page.tsx:1825-1846` — status is inline-edited via `<select>`. Assignee, priority, due date are read-only.
- **Action:** Add inline edit affordance on hover (pencil icon) for priority + due + assignee. Keep status as the dominant interaction.

### 2.18 Reports page — drill-down interactivity — Medium ✅ already shipped
- **Evidence:** `src/components/reports/charts.tsx` (668 lines). Verify clicking a bar/segment filters the underlying issue list. If not, add it — biggest UX win for a reporting screen.

### 2.19 Heimdall log table virtualization — Medium ✅ done
- **Evidence:** `app/heimdall/heimdall-logs-client.tsx` (299 lines) — likely renders all rows. With unbounded retention (see 1.7), tables grow.
- **Action:** Add `react-window` or `@tanstack/react-virtual`. Already a TODO-adjacent need.

### 2.20 Slack monitor — channel/keyword filter — Low ✅ done
- **Evidence:** `app/slack/slack-client.tsx` (1097 lines). Likely renders the activity stream linearly.
- **Action:** Add channel filter + keyword search + per-channel mute.

### 2.21 Wakatime — date range presets — Low ✅ already shipped
- **Evidence:** `app/wakatime/wakatime-client.tsx` (731 lines).
- **Action:** "Today / This week / This month / Last 30 days / Custom" preset chips above charts.

### 2.22 Toast stacking + dismiss-all — Low ✅ done
- **Evidence:** `src/components/Toast.tsx` + `ToastProvider.tsx`.
- **Action:** Cap visible toasts at 3 with `+N more`. Add "Clear all" when stacked.

### 2.23 Notifications panel trigger — Low ✅ done
- **Evidence:** `NotificationsPanel.tsx` exists (238 lines) but no obvious trigger in the nav.
- **Action:** Bell icon in `AppNav` top-right with unread count badge; opens the panel as a slide-in.

### 2.24 Focus rings + reduced motion — Medium (a11y) ✅ done
- **Evidence:** Custom styling in `globals.css` + split component files. Verify focus rings on buttons / links / table rows. Verify `@media (prefers-reduced-motion: reduce)` disables transitions on `app-nav`, modals, drag-drop.
- **Action:** Audit + add `:focus-visible` styles. Wrap CSS transitions in reduced-motion media queries.

### 2.25 Pagination — page size selector — Low ✅ done
- **Evidence:** `app/page.tsx:88` — `pageSize = 20` is hard-coded.
- **Action:** Add 20/50/100 size selector. Persist to localStorage.

---

## 3. Suggested Sequencing

| Phase | Items |
|-------|-------|
| **Now (small, high payoff)** | ✅ 1.3, ⛔ 1.18 (blocked), ✅ 2.3, ✅ 2.4, ✅ 2.6, ✅ 2.7–2.8, ✅ 2.25 |
| **Next (med)** | ⏳ 1.4 (partial: 1.4a–d), ⏳ 1.5 (partial: 1.5a–c), ✅ 1.7, ✅ 1.9, ✅ 2.1, ✅ 2.2, ✅ 2.5, ✅ 2.12, ✅ 2.18, ✅ 2.24 |
| **After** | ✅ 1.1, ✅ 1.6, ✅ 1.8 (runbook), ⛔ 1.12 (design needed), ✅ 1.13, 1.17 (mobile strategy), ✅ 2.19 |
| **Polish / opportunistic** | 1.11, 1.14–1.16, 1.19–1.22, 2.9–2.11, 2.13–2.17, 2.20–2.23 |

Legend: ✅ done · ⏳ partial · ⛔ blocked

---

## 4. Verification Hooks

For each shipped item, ensure:
- Unit/integration tests around the changed module (TDD per CLAUDE.md).
- Telemetry events in `domain.action.state` format with `_succeeded` / `_failed` / `_duration` metrics.
- A Playwright e2e covers the user-visible behavior on at least the dashboard + issue detail flows.
- a11y: `@axe-core/playwright` run (once added) shows no new serious/critical violations.
