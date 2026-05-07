# Mobile/Web Surface Gap Audit Checklist

Audit date: 2026-05-07
Last updated: 2026-05-07 (session 4)

Scope:

- Web routes under `app/`.
- Native Android app under `mobile/android-native`.
- Mobile API routes under `app/api/mobile/v1`.

Legend:

- `[x]` implemented in the current tree.
- `[ ]` still missing.
- `[ ] Partial` means some backend, model, or UI support exists, but web parity is not complete.

## Current Coverage

- [x] Native Android covers core Redmine issue workflow: pairing, issue list, issue detail, comments, status changes, assignment, favorites, create/edit with catalog pickers, time logging, internal notes, GitHub links, AI summary/categorization, token rotation, and logout.
- [x] Native Android has P1 issue-list productivity improvements: dashboard stats, priority filters, explicit search mode selector, open-only toggle, compact density, quick preview, and local saved filter views.
- [x] Native Android has a mobile notification inbox backed by a bearer-auth mobile API endpoint.
- [x] Web theme system consolidated: light/dark/system via ThemeProvider with flash-prevention pre-paint script; Android respects system dark-mode.
- [x] History tab shows Redmine journal field-change details (Status, Assignee, Priority, etc.) inline per journal card.
- [ ] The broader web product surface is still not fully mobile: reports, AI chat/tool execution, ops/admin, Slack, WakaTime, webhooks, API docs, audit logs, push subscription, and offline write queue remain web-only or mostly absent.

## Surface Checklist

### Login / Session

- [x] Pair Android device with Converge using Redmine URL/API key.
- [x] Store mobile token securely.
- [x] Rotate and revoke mobile token.
- [ ] Add server-side account login/bootstrap equivalent to web session login.

### Main Issue Dashboard

- [x] Issue list with search, status chips, sort, pull refresh, and pagination.
- [x] Dashboard stat strip for loaded/open/due soon/overdue/favorites.
- [x] Quick preview dialog from issue list rows.
- [x] Compact/comfortable list density toggle.
- [ ] Add web-level dashboard widgets/charts.
- [ ] Add selectable rows and bulk dashboard actions.
- [ ] Add sync health detail in the mobile dashboard.

### Search And Filters

- [x] Text search.
- [x] Explicit `local` / `hybrid` / `remote` search mode selector.
- [x] Status filter chips.
- [x] Priority filter chips.
- [x] Open-only toggle.
- [x] Add project filter.
- [x] Add assigned-to-me filter.
- [ ] Add GitHub-link/attachment filters.
- [ ] Add due-date and updated-after filters.
- [x] Add mobile FTS search entry backed by bearer auth (`/api/mobile/v1/search` + Android FTS mode).
- [x] Add mobile AI search entry backed by bearer auth (ai/summarize and ai/categorize already accept bearer auth).

### Saved Views

- [x] Save current mobile filters/search/sort/density as local on-device views.
- [x] Apply saved mobile views.
- [x] Delete saved mobile views.
- [ ] Sync saved views with the web saved-view API.
- [ ] Reorder saved views.
- [ ] Support default/shared saved views.

### View Modes

- [x] List mode.
- [ ] Kanban board mode.
- [ ] Gantt mode.

### Bulk Actions

- [ ] Multi-select issues.
- [ ] Bulk status update.
- [ ] Bulk assignment or other batch actions.

### Issue Create / Edit

- [x] Create issue from Android.
- [x] Edit subject/description/priority/due/start/estimate from Android.
- [x] Mobile catalogs endpoint exists for statuses/priorities/trackers/projects.
- [x] Replace numeric project/priority/status entry in Android create/edit forms with catalog pickers.
- [x] Add project catalog support for create form.
- [ ] Add tracker/category/custom-field editing.

### Issue Detail Fields

- [x] Show hero metadata, status, priority, tracker, project, source, done ratio, spent/estimate, due/start dates, author, assignee.
- [x] Show category name when present.
- [x] Show parent issue ID/label when present.
- [x] Make Redmine issue ID tappable to external Redmine issue URL.
- [x] Show parent/children/relations as navigable hierarchy.
- [ ] Show full breadcrumb chain.
- [x] Show custom fields.
- [ ] Add custom-field editing.

### Markdown Description

- [x] Render markdown-ish description instead of plain text.
- [x] Sanitize/normalize common Redmine textile fragments.
- [x] Add full GFM table support.
- [x] Add task-list support.
- [x] Add code highlighting.
- [x] Render authenticated attachment images inline.

### Status Changes

- [x] Show allowed status transitions.
- [x] Change status from Android.
- [ ] Add transition comment/notes in the same status-change action.
- [x] Add properties/change-log view for status and field changes.

### Comments / Journals

- [x] Post Redmine comments from Android.
- [x] Mobile journals endpoint exists.
- [x] Android repository/API models can fetch journals.
- [x] Display existing Redmine journals/comment history in Android UI.
- [x] Display field-change details (property, old value, new value) inline in History tab journal cards.
- [ ] Display field-change journals separately from note/comment journals.

### Assignment

- [x] Fetch assignable users.
- [x] Assign issue.
- [ ] Search/filter large assignable-user lists.

### Favorites

- [x] Toggle favorite from issue detail.
- [x] Favorites tab exists.
- [x] Load favorites independently from current list page/filter.

### Time Tracking

- [x] List time entries.
- [x] Create time entries.
- [x] Delete time entries.
- [x] Android API/repository has update-time-entry plumbing.
- [x] Add edit/update time-entry UI.

### Internal Notes

- [x] List internal notes.
- [x] Create internal notes.
- [x] Delete internal notes.
- [x] Edit internal notes.

### GitHub Links

- [x] List GitHub links.
- [x] Add GitHub links.
- [x] Remove GitHub links.
- [x] Open GitHub link URL.
- [ ] Parse and validate GitHub URLs into repo/issue/PR fields automatically.

### Attachments

- [x] List attachment filename and size.
- [x] Mobile authenticated download endpoint exists.
- [x] Tap attachment to authenticated open/download in Android.
- [ ] Upload attachments from Android.
- [ ] Show image/PDF previews.
- [ ] Partial Resolve attachment references from markdown descriptions.

### Relations / Hierarchy

- [x] List relations.
- [x] Navigate to related issue targets.
- [x] Mobile relation create/delete endpoints exist.
- [x] Android API/repository has relation create/delete plumbing.
- [x] Add relation create/delete UI.
- [x] Add relation type picker.

### Personal / Local Tickets

- [x] Dedicated personal-ticket surface.
- [x] Create local-only ticket from Android.
- [x] Edit local-only ticket from Android.
- [x] Comment/status local-only tickets from Android.
- [x] Delete local-only ticket from Android.

### AI

- [x] AI summary action.
- [x] AI categorization action.
- [ ] AI status indicator.
- [ ] Stale summary queue/history.
- [ ] Issue AI chat (context-prefilled from open issue detail).
- [x] General AI chat with confirmed tool execution (ChatScreen, /api/mobile/v1/chat + execute-tools, two-step confirmation card).

### Notifications

- [x] Mobile bearer-auth notifications endpoint.
- [x] Android Alerts tab/inbox.
- [x] Tap issue notification to open the issue.
- [x] Push subscription from Android (FCM token registration on pair + /api/mobile/v1/push/subscribe).
- [x] Background notification delivery (ConvergeFirebaseMessagingService shows system notification).
- [ ] Read/unread persistence.

### Offline / Sync Queue

- [x] Network connectivity banner.
- [x] Local issue cache for offline list browsing (Room, 7-day eviction, keyed by serverUrl+redmineIssueId).
- [x] Queued offline writes for comments/status/time/favorites (Room OfflineActionEntity, WorkManager OfflineSyncWorker dispatches on reconnect).
- [ ] Conflict handling after reconnect.

### Ops / Admin / Integrations

- [ ] Reports dashboard.
- [ ] Ops health/sync jobs/logs.
- [ ] Mobile token admin beyond current-device rotate/revoke.
- [ ] Users/RBAC management.
- [ ] Audit logs.
- [ ] Slack message/thread surface.
- [ ] WakaTime stats.
- [ ] Webhook subscription/delivery surface.
- [ ] Heimdall/logs surface.
- [ ] API docs/OpenAPI surface.

### Settings / Preferences / Telemetry

- [x] Server URL/device/token/logout settings.
- [x] Sentry Gradle plugin is configured for Android.
- [x] Theme preference (light/dark/system, web ThemeProvider + Android dark-mode setting).
- [ ] Language/locale preference.
- [ ] Account/profile settings.
- [ ] User-facing runtime error reporting/status.

## Native Android Backlog

### P0

- [x] Add `doneRatio` to Android issue model and display in hero/key facts.
- [x] Add internal-note delete action.
- [x] Add urgency/overdue coloring to due dates.
- [x] Add mobile catalog endpoint for statuses/priorities/trackers/projects.
- [x] Replace numeric create/edit fields with catalog-backed pickers.
- [x] Add journal/comment history UI.
- [x] Add independent Favorites loading.
- [x] Wire attachment tap to authenticated open/download.
- [x] Add relation create/delete UI.
- [x] Add time-entry edit UI.
- [x] Add local/personal ticket create/edit/detail support.
- [x] Add markdown parity for tables, task lists, code blocks, and attachment images.

### P1

- [x] Add `parentIssueId` / `parentIssueLabel` to Android issue model.
- [x] Add `categoryName` to Android issue model and detail display.
- [x] Add `startDate` to read view.
- [x] Make issue ID tappable to external Redmine URL.
- [x] Add priority filter chips.
- [x] Add explicit search mode selector.
- [x] Add saved views locally on Android.
- [x] Add issue list density controls.
- [x] Add dashboard stats.
- [x] Add quick preview dialog.
- [x] Add navigable parent/children/relation drilldown.
- [x] Add mobile notification inbox.
- [x] Add `customFieldsJson` to Android issue model and display it in issue detail.
- [x] Add `customFieldsJson` edit support (Edit dialog custom-field text fields → `PATCH /edit`).
- [x] Add properties/change-log tab (field changes shown inline per journal card).
- [x] Add project filter.
- [x] Add FTS/AI search entry points (`/api/mobile/v1/search` + FTS mode in Android search bar).
- [x] Add push subscription flow (FCM, MobilePushToken model, /api/mobile/v1/push/subscribe).
- [x] Add offline cache and queued writes (Room + WorkManager + KSP; OfflineSyncWorker; ViewModel queues COMMENT/STATUS/FAVORITE/TIME_ENTRY when offline and schedules sync on reconnect).

### P2

- [ ] Add board/Gantt mobile views if useful on small screens.
- [x] Add AI chat with confirmed tool execution (ChatScreen + /api/mobile/v1/chat).
- [ ] Add mobile reports with compact KPI/drilldown layout.
- [ ] Add admin/ops surfaces: health, sync jobs, token admin, logs, users/RBAC, audit logs.
- [ ] Add integrations: Slack, WakaTime, webhooks, Heimdall.

## API / Backend Checklist

- [x] Issue-focused mobile API exists.
- [x] Mobile catalogs endpoint exists for statuses/priorities/trackers/projects.
- [x] Mobile journals endpoint exists.
- [x] Mobile notifications endpoint exists.
- [x] Mobile attachment download endpoint exists.
- [x] Mobile relation create/delete endpoints exist.
- [ ] Mobile saved-view API wrappers with bearer auth.
- [x] Mobile FTS/AI search wrappers with bearer auth (`/api/mobile/v1/search` + ai/summarize + ai/categorize).
- [ ] Mobile reports endpoint.
- [x] Mobile personal-ticket endpoints.
- [x] Mobile AI chat endpoints (/api/mobile/v1/chat GET/POST + execute-tools POST, bearer auth).
- [ ] Mobile ops/admin endpoints.
- [ ] Mobile Slack/WakaTime/webhook/Heimdall endpoints.
- [x] Android-safe attachment opener/downloader that carries bearer auth.
- [x] Confirmed `/api/ai/summarize` and `/api/ai/categorize` accept mobile bearer auth via `resolveActorUserId` fallback pattern.

## Suggested Sequencing

1. ~~Finish remaining P0 issue-workflow parity: catalog pickers, journals UI, independent favorites, attachments, relations UI, time edit, local tickets.~~ **P0 complete.**
2. ~~Finish P1 productivity parity: custom field editing, FTS/AI search wrappers, push subscription, offline cache/queued writes.~~ **P1 complete.**
3. ~~Add AI chat with confirmed tool execution.~~ **Done.** Next: mobile reports, ops health surface.
