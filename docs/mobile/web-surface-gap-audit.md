# Mobile/Web Surface Gap Audit

Audit date: 2026-05-07

Scope:

- Web routes under `app/`.
- Native Android app under `mobile/android-native`.
- Ionic app under `mobile/ionic`.
- Mobile API routes under `app/api/mobile/v1`.

## Summary

Native Android now covers the core Redmine issue workflow: pairing, issue list, issue detail, comments, status changes, assignment, favorites, basic create/edit, time logging, internal notes, GitHub links, AI summary/categorization, token rotation, and logout.

It does not cover the broader web app product surface: dashboard widgets, saved views, board/Gantt modes, bulk actions, full reporting, AI chat/tool execution, personal/local tickets, ops/admin, Slack, WakaTime, webhooks, API docs, audit logs, push notifications, and offline sync queue UX.

Ionic is much thinner than native Android. It has pairing, list, and detail screens, but most issue actions are read-only or absent. It also appears to depend on `VITE_API_URL` already pointing at `/api/mobile/v1`, because the client calls `/issues` and `/pair/connect` instead of full mobile paths.

## Surface Matrix

| Web surface | Web capability | Native Android | Ionic | Gap |
| --- | --- | --- | --- | --- |
| Login / session | Browser session login, Redmine connect/bootstrap | Mobile pairing with Redmine URL/API key, secure token, rotate, revoke | Pairing form and token storage | Mobile has no server-side account login or bootstrap flow. Ionic pairing body uses `baseUrl`/`apiKey`; mobile API expects `redmineBaseUrl`/`redmineApiKey`. |
| Main issue dashboard | Stats, filters, issue table, quick peek, charts, widgets, refresh state | Issue list with search, status chips, sort, pull refresh, pagination | Issue list with search and basic cards | Native lacks dashboard widgets, chart summary, quick peek, selectable rows, sync health detail. Ionic lacks filters, sorting, paging controls, status tabs. |
| Search | Local, hybrid, FTS, AI search | Search query with local mode from repository defaults | Hybrid search param | Native has no explicit search mode selector, FTS, or AI search entry. |
| Advanced filters | Status IDs, priority IDs, assigned-to-me, GitHub links, attachments, due date, updated-after | Coarse status chips only | Search only | Missing advanced mobile filters. |
| Saved views | Save/apply/delete/reorder filter views | Not present | Not present | Requires mobile UX plus bearer-compatible saved-view API use. |
| View modes | List, Kanban board, Gantt chart | List only | List only | Board and Gantt are web-only. |
| Bulk actions | Multi-select and bulk status update | Not present | Not present | Needs selection model and mobile bulk-status endpoint/client. |
| Issue create | Project picker, status picker, priority picker, due date | Create dialog with subject, numeric project ID, description, numeric priority ID, due date | Not present | Native should use project/priority/status catalogs instead of numeric fields. Ionic needs create flow. |
| Issue detail overview | Hero, metadata, markdown, breadcrumbs, custom fields, parent/children, attachments, relations, GitHub links | Overview/Notes/Time/Links tabs with core metadata and markdown | Details/Comments/Time tabs | Native lacks full breadcrumbs/custom fields richness and attachment previews/actions. Ionic is mostly read-only and no markdown rendering. |
| Markdown description | Redmine text normalization, GFM, code highlighting/collapse, attachment image resolution, external links | Custom Compose parser, improved but limited | Plain pre-wrap text | Native still lacks full Redmine collapse handling, code highlighting, tables/task lists, authenticated attachment image rendering. Ionic lacks markdown parsing. |
| Status changes | Allowed statuses, transition UI, comments | Allowed-status bottom sheet | Not present | Native status flow works, but no transition comment/notes in same action. Ionic absent. |
| Comments/journals | Journal display and comment posting | Journal-ish notes tab plus comment composer | Comments list only | Native should separate journals from internal notes more clearly. Ionic cannot post comments. |
| Assignment | Assignable users and assign action | Assign sheet | Not present | Native works but lacks search/filter for large user lists. Ionic absent. |
| Favorites | Favorite toggle and favorites endpoint | Toggle from detail; Favorites tab filters loaded issues | Star display only | Native Favorites tab is not independently loaded from `/api/issues/favorites` or a mobile favorite list, so it misses favorites outside current list page/filter. Ionic cannot toggle. |
| Time tracking | List/create/update/delete time entries, activity catalog | List/create/delete time entries | Read-only list | Native lacks edit/update UI even though repository has update capability missing from ViewModel flow. Ionic cannot create/edit/delete. |
| Internal notes | List/create/delete/edit internal notes on web/backend | List/create internal notes | Not present | Native lacks edit/delete. Ionic absent. |
| GitHub links | List/add/remove/open issue/PR links | List/add/remove/open URL | Not present | Native works, but entry is manual. Could parse GitHub URLs and validate repo/issue/PR fields. Ionic absent. |
| Attachments | List, upload, download, image/PDF previews, attachment-aware markdown | List only | Type includes attachments but UI does not expose them | Native has no upload/download/open action wired to authenticated mobile endpoint. Ionic absent. |
| Relations | List, create, delete Redmine relations | Display only | Not present | Native Retrofit/repository/UI do not wire mobile relation endpoints. Ionic absent. |
| Children / hierarchy | Children, parent, breadcrumbs, local/Redmine identifiers | Children list only | Not present | Native lacks navigable breadcrumbs/parent/child drilldown. |
| Personal tickets | Local-only ticket board and create flow | Local issues can appear but create/edit/comment/status are blocked for local-only cases | Not present | No native personal-ticket surface or local issue creation/editing. |
| AI issue actions | Summary, categorization, stale summaries, status indicator | Summary and categorization actions | Not present | Native lacks issue chat, stale summary queue, AI status, AI history. |
| AI chat | Chat page with tool calls and confirmation before actions | Not present | Not present | No mobile chat/tool execution surface. |
| Reports | Aggregate charts, trends, filters, drilldowns, time export/custom reports | Not present | Not present | Web-only. |
| Notifications | Notifications panel, push subscribe API, sync notifications | Offline network banner only | Not present | Mobile has no push subscription, notification inbox, or background sync notification handling. |
| Offline/PWA | Offline page, service worker, offline action queue hooks | Network callback banner only | Not present | Native has no cached issue DB or queued writes. |
| Ops dashboard | Health, sync status/jobs, mobile token admin, logs, manual sync controls | Settings only has token rotate/logout/server info | Not present | Web-only admin/ops surface. |
| Users/RBAC | Admin user management and role changes | Not present | Not present | Web-only. |
| Audit logs | Audit log page | Not present | Not present | Web-only. |
| Slack | Slack message browser, threads, test notification | Not present | Not present | Web-only. |
| WakaTime | Coding stats dashboard | Not present | Not present | Web-only. |
| Webhooks | Subscription management, test deliveries, delivery log | Not present | Not present | Web-only. |
| Heimdall/logs | Log views, refresh, dashboard | Not present | Not present | Web-only. |
| API docs/OpenAPI | API docs route and OpenAPI JSON | Not present | Not present | Web-only. |
| Settings/theme/i18n | Theme, language, locale-aware formatting | Server/device/token/logout only | System Ionic dark palette | Native lacks theme/language/account preferences. Ionic lacks settings surface. |
| Error telemetry | Sentry example pages/API and logging providers | Sentry configuration needs separate verification | Not present | Mobile runtime error reporting is not exposed in UX. |

## Field-Level Gaps (Android Native — May 2026)

Gaps identified by comparing `app/issues/[id]/page.tsx` + `app/page.tsx` against all Android screens.

### Fields missing from `ApiModels.kt` — server returns them but Android ignores

| Field | Type | Web displays | Priority |
|---|---|---|---|
| `doneRatio` | `Int` (0–100) | Header snapshot, table column, overview card, peek sidebar | P0 |
| `customFieldsJson` | `List<CustomField>` | Type-aware display + edit in metadata card | P1 |
| `parentIssueId` / `parentIssueLabel` | `Int?` / `String?` | Breadcrumb navigation chain | P1 |
| `categoryName` / `categoryId` | `String?` / `Int?` | Metadata card read + edit dropdown | P1 |

### Fields in model but displayed incompletely

| Field | Gap |
|---|---|
| `startDate` | Present in edit form only; not shown in `IssueKeyFacts` read view |
| `dueDate` | Shown in `IssueKeyFacts` but no urgency colouring (overdue = red, soon = amber) |
| `redmineIssueId` | Displayed as plain text `#N`; not a tappable link to external Redmine URL |
| `children[].id` | Shown as `#id subject` text; not tappable / no drilldown |

### Actions present on web, absent on Android

| Action | Web location | Priority |
|---|---|---|
| Delete internal note | ✕ button per note in Notes tab | P0 |
| View journals / comment history | History + Notes tabs (all journals with notes) | P0 |
| Properties / change-log tab | Tab showing field changes per journal | P1 |
| Delete local issue | Delete button (local-only issues) | P1 |
| Tap attachment to open/download | Authenticated download via mobile endpoint | P0 (existing backend) |

### Issue list — per-row display gaps

| Gap | Web behaviour |
|---|---|
| No urgency pill | `overdue` / `soon` / `due-today` badge next to subject |
| No done ratio column | Optional column showing 0–100 % |
| No priority filter chip | Dropdown filter alongside status chips |
| No project filter chip | Dropdown filter above chip row |

---

## Native Android Backlog

P0:

- Replace numeric create/edit inputs with mobile catalog endpoints for projects, priorities, statuses, trackers, categories, and activities.
- Add `doneRatio` to `ApiModels.kt` and display in `IssueHero` + `IssueKeyFacts` (progress bar or `SmallStat`).
- Add journal/comment history view so existing Redmine comments are readable (not just postable).
- Add internal note delete action per note row.
- Add urgency/overdue colouring to `dueDate` in list rows and detail header.
- Add independent Favorites loading so the tab is not limited to the current issue page.
- Wire attachment tap → authenticated open/download via existing mobile attachment endpoint.
- Wire relation create/delete UI to existing mobile relation endpoints.
- Add time-entry edit UI.
- Add local/personal ticket create/edit/detail support, or clearly hide local-only actions until supported.
- Add markdown parity for tables, task lists, collapsible Redmine sections, code blocks, and attachment images.

P1:

- Add `parentIssueId`, `categoryName/Id`, `customFieldsJson` to `ApiModels.kt` and display/edit them.
- Add `startDate` to `IssueKeyFacts` read view (already editable).
- Make issue ID (`#N`) a tappable external link to Redmine base URL.
- Add properties/change-log tab showing per-journal field deltas.
- Add project filter and priority filter chips to issue list.
- Add urgency pill to issue list rows (`overdue` / `soon` / `due-today`).
- Add advanced filters, saved views, explicit search mode selector, and FTS/AI search entry points.
- Add issue list density controls, dashboard stats, and quick peek/preview equivalents for mobile.
- Add navigable hierarchy: parent, breadcrumbs, children, and related issue drilldown.
- Add notification inbox and push subscription flow.
- Add offline cache plus queued writes for comments/status/time/favorites.

P2:

- Add board/Gantt mobile views only if they can be made usable on small screens.
- Add AI chat with confirmed tool execution.
- Add mobile reports with a compact KPI/drilldown layout.
- Add admin/ops surfaces: health, sync jobs, token admin, logs, users/RBAC, audit logs.
- Add integrations: Slack, WakaTime, webhooks, Heimdall.

## Ionic Backlog

P0:

- Fix pairing/API contract: use `/api/mobile/v1/pair/connect` fields or set `VITE_API_URL` to the mobile API root and align request bodies.
- Add missing actions: create issue, comment, status update, assignment, favorite toggle, time entry create/delete, logout.
- Add markdown rendering instead of plain pre-wrapped descriptions.

P1:

- Add filters/sorting/pagination and pull-to-refresh parity with native Android.
- Add attachments, relations, GitHub links, internal notes, and settings.
- Remove the fixed debug banner from `App.tsx` for production builds.

P2:

- Decide whether Ionic remains a supported product. If native Android is the main mobile target, keep Ionic as a prototype only and document that status.

## API / Backend Gaps

- Mobile has issue-focused endpoints but not mobile-specific saved views, reports, notifications, projects/catalog bootstrap, personal tickets, chat, ops, Slack, WakaTime, webhooks, or audit logs.
- Some web APIs are session-cookie oriented. Mobile needs bearer-token access or mobile-specific wrappers before native clients can call them safely.
- Mobile issue create needs catalog endpoints to avoid numeric ID entry.
- Mobile attachment download exists, but clients need an authenticated in-app downloader/opener because external browsers will not include the bearer token.
- AI summary/categorization endpoints are called from native Android through general `/api/ai/*` routes. Confirm those routes consistently accept mobile bearer auth, or add `/api/mobile/v1/ai/*` wrappers.

## Suggested Sequencing

1. Finish issue-workflow parity: catalogs, attachments, relations, favorite list, time edit, local tickets.
2. Add mobile productivity parity: saved views, advanced filters, notifications, offline queue.
3. Add high-value web-only modules: AI chat, reports, ops health.
4. Decide Ionic support level and either bring it to native parity or mark it as legacy/prototype.
