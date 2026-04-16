# TODO

## In Progress

## Pending

### ✨ Future / Post-MVP Features
- [ ] **Redmine Custom Fields Integration** — Support rendering and editing custom fields, which are core to Redmine enterprise workflows.
- [ ] **Interactive Gantt Chart View** — A visual timeline view grouping tasks by project/epic and plotting them on a timeline.
- [ ] **Command Palette (Cmd+K)** — Quick navigation launcher to instantly search for an issue, jump to a project, or trigger an action (keyboard-first workflow).
- [ ] **Jira-Style Kanban Board** — A full agile board with drag-and-drop columns for statuses, allowing rapid triaging of issues.
- [ ] **Real-Time WebSocket/SSE Updates Pipeline** — Pushing live atomic updates to clients via WebSockets / Server-Sent Events instead of relying purely on polling or background sync.
- [ ] **Localization (i18n)** — Adding support for multiple languages using `next-intl` or similar to support global teams.

---

## Done

| Feature | Status | Notes | Date |
|---------|--------|-------|------|
| All Features | ✅ DONE | See completed items below | 2026-04-16 |
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
