# TODO

## Pending
- [ ] **Mobile Application** — Broken, explore alternative approaches using Electron, Ionic framework or Apache Cordova

### 🔧 Technical Debt
- [x] **Split `app/page.tsx`** — Extracted types → `src/types/dashboard.ts`, utils → `src/lib/issue-utils.ts`, MarkdownBlock → `src/components/MarkdownBlock.tsx`. Deleted 630+ lines of dead drawer code and dead state/handlers. Page down from 3026 → 1926 lines.
- [x] **Enable TypeScript strict build** — Fixed all 6 TS errors. Removed `ignoreBuildErrors` flag from `next.config.ts`.
- [x] **Resolve conflicting `.dashboard` CSS rules** — `dashboard.css` was never imported (dead file). Deleted.
- [x] **Split `globals.css`** — Split 7569-line monolith into `globals.css` (2161 lines, foundation) + `app/styles/components.css`, `dashboard-detail.css`, `reports-ai.css`, `issue-ui.css`. Imported in order from `layout.tsx`.
- [x] **Login page + auth redirect** — `/login` page with manual connect + env bootstrap. Middleware redirects unauthenticated requests.

### 🏗️ Infrastructure
- [ ] **Migrate Pi from SQLite to PostgreSQL** — Architecture doc flags SQLite as MVP-only. Concurrent writes lock. Docker Compose Postgres config already exists (`docker-compose.postgres.yml`).
- [ ] **Streamline log pruning** — Poller ingests 300 records every 5 min with no retention policy. Unbounded DB growth on Pi (disk already at 73%).
- [x] **Review Dependabot vulnerability** — PostCSS CVE (GHSA-qx2v-qp2m-jg93) patched via `overrides` forcing postcss >=8.5.10.

### ✨ Future / Post-MVP Features
- [ ] **Interactive Gantt Chart View** — A visual timeline view grouping tasks by project/epic and plotting them on a timeline.
- [ ] **Jira-Style Kanban Board** — A full agile board with drag-and-drop columns for statuses, allowing rapid triaging of issues.
- [ ] **Real-Time WebSocket/SSE Updates Pipeline** — Pushing live atomic updates to clients via WebSockets / Server-Sent Events instead of relying purely on polling or background sync.

---

## Done

| Feature | Status | Notes | Date |
|---------|--------|-------|------|
| Technical Debt Cleanup | ✅ DONE | page.tsx 3026→1926 lines, globals.css split into 5 files, ignoreBuildErrors removed | 2026-05-06 |
| Login Page + Auth Redirect | ✅ DONE | /login with manual connect + bootstrap, middleware guards all routes | 2026-05-06 |
| Horizontal Overflow Fix | ✅ DONE | auto-fit grids, overflow-x: hidden on .main-content | 2026-05-06 |
| Hide Nav When Unauthenticated | ✅ DONE | Server-side session check in layout, zero margin when no nav | 2026-05-06 |
| TypeScript Errors | ✅ DONE | Fixed 6 TS errors in page.tsx and AiStatusIndicator | 2026-05-06 |
| PostCSS CVE Patch | ✅ DONE | Forced postcss >=8.5.10 via npm overrides | 2026-05-06 |
| Dead CSS Cleanup | ✅ DONE | Deleted orphaned dashboard.css (575 lines, never imported) | 2026-05-06 |
| All Features | ✅ DONE | See completed items below | 2026-04-16 |
| Redmine Custom Fields Integration | ✅ DONE | Render/edit custom fields on issue detail, API for fetching, local storage in JSON | 2026-04-17 |
| Translation Refactor | ✅ DONE | i18n for filters, queue stats, sync status, ops alerts, activity feed, saved views | 2026-04-17 |
| Saved Views UX | ✅ DONE | Drag-and-drop reorder for saved views using @dnd-kit | 2026-04-16 |
| Mobile / PWA | ✅ DONE | Offline sync queue, Mobile issue creation, Push Notifications | 2026-04-16 |
| UX/UI Polish | ✅ DONE | Toasts, Issue Modal, Column Picker, Shortcuts, Accessibility | 2026-04-16 |
| AI Tool Calls | ✅ DONE | Structured definitions for status, time log, comment actions | 2026-04-16 |
| AI Chat | ✅ DONE | Streaming SSE responses for real-time interaction | 2026-04-16 |
| Core Cleanup | ✅ DONE | Extracted hooks from page.tsx, removed legacy drawer | 2026-04-15 |
| Persistence | ✅ DONE | Server-side saved views, filter presets, and custom reports | 2026-04-15 |
| Security | ✅ DONE | CSRF protection, Rate-limiting, RBAC enforcement audit | 2026-04-15 |
| AI Insights | ✅ DONE | Bulk summarisation, Smarter FTS ranking, Slack parsing | 2026-04-15 |
| Reporting | ✅ DONE | Velocity/Burndown charts, Time-tracking exports, Webhook logs | 2026-04-15 |
| Testing | ✅ DONE | Vitest unit tests (198+), Playwright E2E smoke tests | 2026-04-15 |
| DevOps | ✅ DONE | GH Actions CI, Structured logging, Redis health checks | 2026-04-15 |
| Tailscale Aperture | ✅ DONE | Private LLM gateway support | 2026-04-15 |
| External Tickets API | ✅ DONE | REST API for n8n/Zapier integrations | 2026-04-14 |
| Webhook system | ✅ DONE | DB-backed subscriptions and delivery history | 2026-04-14 |
| WakaTime | ✅ DONE | Full time tracking and analytics integration | 2026-04-14 |
| Slack Monitor | ✅ DONE | Multi-channel monitoring and auto-notifications | 2026-04-13 |
| Swagger Docs | ✅ DONE | Full API reference at /api-docs | 2026-04-13 |
| Redmine Sync | ✅ DONE | Initial connection, bootstrap, and multi-stage sync | 2026-04-13 |
| Heimdall Refactor | ✅ DONE | Auto-refreshing dashboard for ops teams | 2026-04-13 |
