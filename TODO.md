# TODO

## In Progress

## Pending

### 🔌 Integrations
- [ ] Wrap OpenRouter around Tailscale Aperture (private LLM gateway / private routing)
- [ ] Create/update issues from `SLACK_DEFAULT_CHANNEL_ID` (Slack → Redmine issue creation)
- [x] AI tool calls — expose structured tool definitions so LLM can take in-app actions (e.g. update status, log time, close issue)

### 🏗️ Architecture / Code Health
- [ ] **Split `app/page.tsx`** — the root page is 2,865 lines and holds all logic, state, and JSX in a single component. Extract into:
  - `IssueQueue` component (table + pagination + sort + filters)
  - `DashboardHeader` / `SyncStatus` component
  - `InsightsGrid` component (status/priority charts)
  - Individual hooks: `useIssues`, `useSyncState`, `useTimer`, `useSavedViews`
- [ ] **Persist saved-views server-side** — they currently live in `localStorage` only, so they are lost on a different browser/device. Add a `SavedView` Prisma model and `/api/saved-views` CRUD endpoints.
- [ ] **Filter presets persistence** — `filterPresets` state is never populated from an API; the save button calls `prompt()` which is a browser anti-pattern. Implement a proper UI modal and persist presets to DB.
- [ ] **Drag-and-drop reorder** — `onDrop` handler in the issue table is a no-op placeholder (`// Reorder logic would go here`). Implement actual priority-based reordering or manual queue ordering.
- [ ] **Saved views: include advanced filters** — `AdvancedFilters` state (`statusIds`, `priorityIds`, `assignedToMe`, etc.) is not included in `SavedView`, so restoring a view loses those filters.
- [ ] **Legacy drawer dead code** — `legacyIssueDrawerEnabled = false` is hardcoded; the old modal is still fully rendered (~400 lines of JSX). Remove it or hide behind a feature flag properly.
- [ ] **Embeddings provider gap** — `generateEmbeddings` in `LLMProviderManager` always falls back to Ollama regardless of the configured provider. Add OpenAI/OpenRouter embedding support.
- [ ] **`globals.css` size** — at 130 KB / 7,569 lines, the CSS is approaching maintainability limits. Consider splitting into per-page/feature CSS modules.
- [ ] **`swagger.ts` size** — 24 KB of hand-written Swagger docs. Consider auto-generating from Zod schemas to keep docs in sync with validation.

### 🔒 Security / Auth
- [ ] **Add CSRF protection** — mutable API routes (POST/DELETE) currently rely only on session cookies; add a CSRF token header check or SameSite=Strict enforcement audit.
- [ ] **Rate-limit `sync/manual-pull`** — the endpoint has no per-user throttle; a rapid user can hammer Redmine.
- [ ] **Credential rotation UX** — users have no UI to change their Redmine API key once connected; implement a "Re-connect" flow in Settings.
- [ ] **RBAC enforcement audit** — `src/lib/rbac.ts` exists but many API routes may not be applying role checks consistently.

### 🤖 AI Features
- [ ] **Streaming AI chat responses** — `StreamingResponse.tsx` exists but `chat` endpoint appears non-streaming. Wire up SSE/ReadableStream for real-time chat output.
- [ ] **AI-generated issue creation from Slack** — parse Slack messages and draft Redmine issues via LLM tool calls.
- [ ] **AI bulk summarisation** — add a "Summarise all stale issues" batch endpoint for AI triage.
- [ ] **Smarter FTS ranking** — the full-text search returns results but has no ranking/scoring signal beyond recency.

### 📊 Analytics & Reporting
- [ ] **Time-tracking report export** — WakaTime data + Redmine time entries exist but there's no combined export (PDF/CSV of "hours per project per week").
- [ ] **Velocity / burndown chart** — `DashboardWidgets` has Chart.js but no burndown or sprint-burn visualisation.
- [ ] **Custom report builder persistence** — `CustomReports.tsx` exists but report configurations don't appear to be saved to a `UserReport` DB model.
- [ ] **Webhook delivery log UI** — webhooks are dispatched but there's no admin view to inspect delivery history, retry failures, or view response bodies.

### 📱 Mobile / PWA
- [ ] **Offline sync queue** — `lib/offline-db.ts` and `lib/sync-queue.ts` exist but the Service Worker (`app/sw.ts`) is minimal. Implement offline-first mutation queuing so time logs and comments can be submitted offline.
- [ ] **Mobile issue creation** — `/api/mobile` and `mobile-api.ts` exist but no mobile-specific issue-create endpoint.
- [ ] **PWA push notifications** — leverage existing service worker registration to deliver push alerts for overdue issues or new Slack messages.

### 🎨 UX / UI Polish
- [ ] **Dark mode toggle** — `ThemeProvider.tsx` and dark CSS variables exist (`[data-theme="dark"]`) but there's no theme toggle button visible in the UI or `AppNav`.
- [ ] **Toast notification system** — `error` and `infoMessage` are displayed as raw `<p>` banners. Replace with a dismissible toast component (animated, auto-dismiss).
- [ ] **Issue creation modal** — there's no way to create a new Redmine issue from the dashboard; only syncing existing issues is supported.
- [ ] **Keyboard nav improvements** — `?` opens shortcuts, `/` focuses search, but there's no shortcut to open the AI search bar or navigate between panels.
- [ ] **Accessibility (a11y) audit** — many interactive `div`s and `button`s lack `aria-live` regions for dynamic updates (status changes, sync progress).
- [ ] **Column picker for issue table** — users cannot hide/show columns (e.g. hide Progress or Activity).

### 🧪 Testing
- [ ] **Expand unit test coverage** — `src/components/__tests__` and `app/api/__tests__` directories exist but coverage is likely sparse. Add tests for `sync.ts`, `llm-provider.ts`, and API route handlers.
- [ ] **End-to-end (E2E) tests** — no Playwright/Cypress tests present. Add a smoke test suite for the happy path: connect → sync → view issues → log time.
- [ ] **Webhook dispatch tests** — the `dispatchWebhook` function has complex branching (created/updated/status-changed/assigned); add unit tests to cover each branch.

### 🛠️ DevOps / Infrastructure
- [ ] **GitHub Actions CI** — add a workflow to run `npm run lint && npm run test` on PRs.
- [ ] **Database migration safety** — multiple migration files exist; document the rollback strategy and add a `make migrate:rollback` target.
- [ ] **Structured logging** — `src/lib/log.ts` is a thin wrapper; integrate with a proper log aggregator (Loki, Datadog, etc.) for the production Docker image.
- [ ] **Memory profiling** — `mem:dev` / `mem:start` scripts exist but there's no automated memory regression test to catch leaks introduced in new features.
- [ ] **Upstash Redis health check** — `redis.ts` is used for rate limiting; add a startup health check so the app fails fast if Redis is unavailable rather than silently falling back.

---

## Done

| Feature | Status | Notes | Date |
|---------|--------|-------|------|
| External Tickets API | ✅ DONE | REST API for n8n/Zapier integrations, search and filter tickets | 2026-04-14 |
| Webhook subscription system | ✅ DONE | DB-backed webhook endpoints, UI at /webhooks, dispatches on ticket events | 2026-04-14 |
| WakaTime API integration | ✅ DONE | Full worktime tracking with stats, charts, insights, goals, and heartbeat data | 2026-04-14 |
| swagger api documentation | ✅ DONE | Added /heimdall/data and /heimdall/refresh to Swagger UI | 2026-04-13 |
| integrate to streamline REST API + logs | ✅ DONE | Prisma models + import script complete | 2026-04-13 |
| slack integration - read group messages | ✅ DONE | Slack page with multi-channel monitoring, auto-refresh, and message display | 2026-04-13 |
| slack integration - send Redmine updates to channel | ✅ DONE | SlackNotifier service integrated into sync workflow | 2026-04-13 |
| slack integration - webhook for external notifications | ✅ DONE | POST /api/slack/notify endpoint | 2026-04-13 |
| swagger api documentation | ✅ DONE | Swagger UI at /api-docs with full API reference | 2026-04-13 |
| heimdall auto-refresh | ✅ DONE | Auto-refresh every 5 minutes with toggle | 2026-04-13 |
