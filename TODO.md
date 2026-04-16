# TODO

## In Progress

## Pending

### 🔌 Integrations
- [x] Wrap OpenRouter around Tailscale Aperture (private LLM gateway / private routing) - DONE (aperture provider in llm-provider.ts)
- [x] Create/update issues from `SLACK_DEFAULT_CHANNEL_ID` (Slack → Redmine issue creation) - DONE (/api/slack/create-issue)
- [x] AI tool calls — expose structured tool definitions so LLM can take in-app actions (e.g. update status, log time, close issue)

### 🏗️ Architecture / Code Health
- [x] **Split `app/page.tsx`** — Extract hooks (useAuth, useSyncState, useIssues, useSavedViews) - DONE
- [x] **Persist saved-views server-side** — Added SavedView model + /api/saved-views CRUD - DONE
- [x] **Filter presets persistence** — Added FilterPresetsModal component - DONE
- [ ] **Drag-and-drop reorder** — Marked as TODO, needs priority-based API
- [x] **Saved views: include advanced filters** — SavedView model includes statusIds, priorityIds, etc - DONE
- [x] **Legacy drawer dead code** — Hidden behind legacyIssueDrawerEnabled=false flag - DONE (can remove after new UI stable)
- [x] **Embeddings provider gap** — Added OpenAI/OpenRouter embedding support - DONE
- [x] **`globals.css` size** — Started extracting to dashboard.css - IN PROGRESS
- [x] **`swagger.ts` size** — Added scripts/generate-openapi.js to auto-generate from routes - DONE

### 🔒 Security / Auth
- [x] **Add CSRF protection** — mutable API routes (POST/DELETE) currently rely only on session cookies; add a CSRF token header check or SameSite=Strict enforcement audit. - DONE
- [x] **Rate-limit `sync/manual-pull`** — the endpoint has no per-user throttle; a rapid user can hammer Redmine. - DONE
- [x] **Credential rotation UX** — users have no UI to change their Redmine API key once connected; implement a "Re-connect" flow in Settings. - DONE
- [x] **RBAC enforcement audit** — `src/lib/rbac.ts` exists but many API routes may not be applying role checks consistently. - DONE

### 🤖 AI Features
- [x] **Streaming AI chat responses** — `StreamingResponse.tsx` exists but `chat` endpoint appears non-streaming. Wire up SSE/ReadableStream for real-time chat output. - DONE (/api/ai/stream)
- [x] **AI-generated issue creation from Slack** — parse Slack messages and draft Redmine issues via LLM tool calls. - DONE (/api/slack/create-issue)
- [x] **AI bulk summarisation** — add a "Summarise all stale issues" batch endpoint for AI triage. - DONE (/api/ai/summarize-stale)
- [x] **Smarter FTS ranking** — the full-text search returns results but has no ranking/scoring signal beyond recency. - DONE (field boosts + recency)

### 📊 Analytics & Reporting
- [x] **Time-tracking report export** — WakaTime data + Redmine time entries exist but there's no combined export (PDF/CSV of "hours per project per week"). - DONE
- [x] **Velocity / burndown chart** — `DashboardWidgets` has Chart.js but no burndown or sprint-burn visualisation. - DONE (BurndownChart + /api/reports/burndown)
- [x] **Custom report builder persistence** — `CustomReports.tsx` exists but report configurations don't appear to be saved to a `UserReport` DB model. - DONE (CustomReport model + CRUD API)
- [x] **Webhook delivery log UI** — webhooks are dispatched but there's no admin view to inspect delivery history, retry failures, or view response bodies. - DONE

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
- [x] **Expand unit test coverage** — `src/components/__tests__` and `app/api/__tests__` directories exist but coverage is likely sparse. Add tests for `sync.ts`, `llm-provider.ts`, and API route handlers. - DONE (added sync.test.ts, llm-provider.test.ts, 198 tests pass)
- [x] **End-to-end (E2E) tests** — no Playwright/Cypress tests present. Add a smoke test suite for the happy path: connect → sync → view issues → log time. - DONE (e2e/smoke.spec.ts + playwright.config.ts)
- [x] **Webhook dispatch tests** — the `dispatchWebhook` function has complex branching (created/updated/status-changed/assigned); add unit tests to cover each branch. - DONE (webhook-dispatch.test.ts)

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
