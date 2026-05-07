# Mobile/Web Surface Gap Audit Checklist

Audit date: 2026-05-07
Last updated: 2026-05-07

Scope:

- Web routes under `app/`.
- Native Android app under `mobile/android-native`.
- Mobile API routes under `app/api/mobile/v1`.

Legend:

- `[x]` implemented in the current tree.
- `[ ]` still missing.
- `[ ] Partial` means some backend, model, or UI support exists, but web parity is not complete.

## Current Coverage

- [x] Native Android covers core Redmine issue workflow: pairing, issue list, issue detail, comments, status changes, assignment, favorites, basic create/edit, time logging, internal notes, GitHub links, AI summary/categorization, token rotation, and logout.
- [x] Native Android has P1 issue-list productivity improvements: dashboard stats, priority filters, explicit search mode selector, open-only toggle, compact density, quick preview, and local saved filter views.
- [x] Native Android has a mobile notification inbox backed by a bearer-auth mobile API endpoint.
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
- [ ] Add assigned-to-me filter.
- [ ] Add GitHub-link/attachment filters.
- [ ] Add due-date and updated-after filters.
- [ ] Add mobile FTS search entry backed by bearer auth.
- [ ] Add mobile AI search entry backed by bearer auth.

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
- [ ] Partial Replace numeric project/priority/status entry in Android create/edit forms with catalog pickers.
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
- [ ] Add properties/change-log view for status and field changes.

### Comments / Journals

- [x] Post Redmine comments from Android.
- [x] Mobile journals endpoint exists.
- [x] Android repository/API models can fetch journals.
- [x] Display existing Redmine journals/comment history in Android UI.
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
- [ ] Edit internal notes.

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

- [ ] Dedicated personal-ticket surface.
- [ ] Create local-only ticket from Android.
- [ ] Edit local-only ticket from Android.
- [ ] Comment/status local-only tickets from Android.
- [ ] Delete local-only ticket from Android.

### AI

- [x] AI summary action.
- [x] AI categorization action.
- [ ] AI status indicator.
- [ ] Stale summary queue/history.
- [ ] Issue AI chat.
- [ ] General AI chat with confirmed tool execution.

### Notifications

- [x] Mobile bearer-auth notifications endpoint.
- [x] Android Alerts tab/inbox.
- [x] Tap issue notification to open the issue.
- [ ] Push subscription from Android.
- [ ] Background notification delivery.
- [ ] Read/unread persistence.

### Offline / Sync Queue

- [x] Network connectivity banner.
- [ ] Local issue cache for offline detail/list browsing.
- [ ] Queued offline writes for comments/status/time/favorites.
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
- [ ] Theme preference.
- [ ] Language/locale preference.
- [ ] Account/profile settings.
- [ ] User-facing runtime error reporting/status.

## Native Android Backlog

### P0

- [x] Add `doneRatio` to Android issue model and display in hero/key facts.
- [x] Add internal-note delete action.
- [x] Add urgency/overdue coloring to due dates.
- [x] Add mobile catalog endpoint for statuses/priorities/trackers/projects.
- [ ] Partial Replace numeric create/edit fields with catalog-backed pickers.
- [x] Add journal/comment history UI.
- [x] Add independent Favorites loading.
- [x] Wire attachment tap to authenticated open/download.
- [x] Add relation create/delete UI.
- [x] Add time-entry edit UI.
- [ ] Add local/personal ticket create/edit/detail support.
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
- [ ] Partial Add `customFieldsJson` to Android issue model and display/edit it.
- [ ] Add properties/change-log tab.
- [x] Add project filter.
- [ ] Add FTS/AI search entry points.
- [ ] Add push subscription flow.
- [ ] Add offline cache and queued writes.

### P2

- [ ] Add board/Gantt mobile views if useful on small screens.
- [ ] Add AI chat with confirmed tool execution.
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
- [ ] Mobile FTS/AI search wrappers with bearer auth.
- [ ] Mobile reports endpoint.
- [ ] Mobile personal-ticket endpoints.
- [ ] Mobile AI chat endpoints.
- [ ] Mobile ops/admin endpoints.
- [ ] Mobile Slack/WakaTime/webhook/Heimdall endpoints.
- [x] Android-safe attachment opener/downloader that carries bearer auth.
- [ ] Confirm `/api/ai/summarize` and `/api/ai/categorize` consistently accept mobile bearer auth, or add `/api/mobile/v1/ai/*` wrappers.

## Suggested Sequencing

1. Finish remaining P0 issue-workflow parity: catalog pickers, journals UI, independent favorites, attachments, relations UI, time edit, local tickets.
2. Finish P1 productivity parity: custom fields, project filter, change log, FTS/AI search wrappers, push, offline queue.
3. Add high-value web-only modules: AI chat, reports, ops health.
