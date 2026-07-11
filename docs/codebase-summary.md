# Codebase Summary

This document provides a summary of the Converge codebase structure.

## High-Level Overview

The project is a [Next.js](https://nextjs.org/) application written in [TypeScript](https://www.typescriptlang.org/). It uses [Prisma](https://www.prisma.io/) as an ORM for a Supabase PostgreSQL database. The code is organized into several main directories.

## Directory Structure

### `app/`

This directory contains the core of the Next.js application, following the App Router structure.

- **`app/layout.tsx` and `app/page.tsx`:** The main application layout and entry point. `app/page.tsx` is the authenticated dashboard shell (787 lines as of 2026-07-11, down from 2039) — most of its state and rendering lives in `src/hooks/` and `src/components/dashboard/` (see below).
- **`app/globals.css` and `app/page.module.css`:** Global and page-specific styles.
- **`app/api/`:** Contains all the backend API route handlers. Each subdirectory corresponds to an API endpoint.
  - `app/api/issues/`: Issue CRUD, creation, edit, assign, bulk-status, attachments, relations, timelog.
  - `app/api/projects/`: Fetches available Redmine projects.
  - `app/api/redmine/`: Handles connection to Redmine.
  - `app/api/sync/`: Handles the data synchronization logic.
  - `app/api/session/`: Manages user sessions.
  - `app/api/time-entries/`: Time entry list/update/delete.
  - `app/api/internal/`: Internal endpoints (`users`, `priorities`, `activities`, `enumerations`).
  - `app/api/ai/`: AI-powered search, summarize, and categorize.
  - `app/api/mobile/v1/`: Mobile API routes (token-authenticated).
  - `app/api/sentry-*/`: Sentry test/smoke endpoints.
- **`app/issues/[id]/page.tsx`:** Issue detail page with editing, breadcrumbs, child issues, tabs.
- **`app/ops/`:** The UI for the sync operations page.
- **`app/reports/`:** The UI for the reports page.

### `src/`

This directory contains reusable library code, components, and other source files that are not directly part of the Next.js routing structure.

- **`src/lib/`:** A collection of library modules used across the application.
  - `auth.ts`: Authentication-related functions.
  - `db.ts`: Prisma client instance.
  - `redmine.ts`: Redmine API client (issue CRUD, time entries, relations, enumerations).
  - `sync.ts`: Core synchronization logic (issue upsert, children, breadcrumbs, relations).
  - `schemas.ts`: Zod schemas for data validation.
  - `session.ts`: Session management utilities.
  - `env.ts` / `env-validator.ts`: Environment variable loading and validation.
  - `telemetry.ts`: Structured logging and Sentry metrics.
  - `log.ts`: Console-based JSON logger.
  - `memory.ts`: Memory usage polling for diagnostics.
  - `http.ts`: HTTP utilities (JSON parsing, error responses).
  - `rate-limit.ts`: In-memory rate limiting.
  - `ai-tools.ts`: Definitions and execution engine for Redmine AI tools.
  - `llm-provider.ts`: Multi-provider LLM manager with tool-calling support.
  - `ai-prompt.ts`: Prompt construction for AI features.
  - `push.ts`: Server-side PWA push notification delivery (Web Push).
- **`src/hooks/`:** Custom hooks for shared logic. `app/page.tsx` was split 2026-07-11 (2039 → 787 lines) into most of these — each owns one slice of dashboard state/behavior and is unit-tested independently in `src/hooks/__tests__/`.
  - `useAuth.ts` / `useSyncState.ts` / `useIssues.ts` / `useSavedViews.ts`: Pre-split shared data hooks.
  - `useDashboardSavedViews.ts`: Saved-view CRUD + active-view tracking for the dashboard.
  - `useEventStream.ts`: SSE subscription to `/api/events/stream` with a ref-held handler map.
  - `usePageSize.ts`: LocalStorage-backed page-size preference.
  - `useOfflineAction.ts`: Mutation queuing for offline-first support.
  - `useInternalNotes.ts`: Internal note CRUD for the issue detail page.
  - `useIssueHoverPreview.ts`: 300ms-delayed issue hover tooltip state.
  - `useDashboardKeyboardShortcuts.ts`: Global dashboard keyboard shortcuts (`/`, `f`, `r`, `g`, `o`, `?`, `a`, `Alt+1-4`, `Escape`).
  - `useIssueFiltering.ts`: Priority-option derivation, project/advanced/favorites/status filter pipeline, the `summary` aggregation (status/priority mix, at-risk, recent activity).
  - `useBulkIssueActions.ts`: Bulk status/priority update, mark-done, kanban drag-drop status change.
  - `useDashboardData.ts`: Session/bootstrap/AI-status/issues/sync/activities/favorites loading, the startup + poll-and-SSE-refresh effects. The biggest of the split hooks.
  - `useFilterPresets.ts`: In-session (non-persisted) saved filter presets.
- **`src/components/`:** Reusable React components.
  - `QuickActionsPanel.tsx`: Status, assign, and time logging panel.
  - `TimeTrackingPanel.tsx`: Time entry display and creation.
  - `AdvancedFilters.tsx`: Filter chips and advanced search.
  - `ProjectFilter.tsx`: Project-scoped filtering.
  - `ExportButton.tsx`: CSV/print export.
  - `DashboardWidgets.tsx`: Stats and metrics display.
  - `NotificationsPanel.tsx`: Notification management.
  - `ToastProvider.tsx` / `Toast.tsx`: Global notification system.
  - `IssueCreateModal.tsx`: New issue creation form.
  - `ColumnPicker.tsx`: Table column visibility toggle.
  - `ai/`: AI-powered search bar and issue actions.
  - `dashboard/`: The other half of the 2026-07-11 `app/page.tsx` split — presentational components paired with the hooks above, each with a co-located `__tests__/` file.
    - `DashboardLoginScreen.tsx`: Unauthenticated connect-to-Redmine form.
    - `IssueHoverTooltip.tsx`: Renders `useIssueHoverPreview`'s state.
    - `DashboardHero.tsx`: Top metrics grid (compact/expanded).
    - `InsightsGrid.tsx`: Status/priority mix cards.
    - `OpsAlertsCard.tsx` / `ActivityFeedCard.tsx`: At-risk alerts panel, recent-activity feed.
    - `DashboardFiltersPanel.tsx`: Status/priority/sort/search filters + saved-views panel + AI/FTS search toggles.
    - `IssueQueueRow.tsx`: Single table row.
    - `IssueQueueCard.tsx`: The issue-queue card as a whole — header stats, bulk-action toolbar, quick filters, filter-presets UI, project/favorites/export controls, view-mode tabs, and the table/kanban/gantt + pagination rendering. Kept as one flat component (not decomposed further) since it was the highest-risk/densest piece of the split.

### `mobile/`

This directory contains the source code for the mobile applications.

- **`mobile/flutter_nrcc/`:** A complete Flutter project for the cross-platform mobile app.

### `prisma/`

This directory contains all Prisma-related files.

- **`prisma/schema.prisma`:** The Prisma schema file, which defines the database models.
- **`prisma/init.sql`:** An SQL script to initialize the database.

### `scripts/`

Operational scripts for syncing and maintaining data. See [sync-scripts.md](./sync-scripts.md) for details.

- `sync-all-issues.js` — Full paginated sync of all Redmine issues.
- `sync-children-quick.js` — Update children data for specific issues.
- `sync-issue-children.js` — Full recursive child sync.
- `sync-redmine-users.js` — Extract and sync Redmine users.
- `sync-enumerations.js` — Sync priorities, activities, categories.
- `check-issues.js` / `check-children.js` / `check-enums.js` — Quick database inspection.
- `test-time-entries.js` — Compare time entries between Redmine and local DB.

### `docs/`

Project documentation.

- `project-overview.md` — Features, data model, tech stack.
- `api-reference.md` — All API routes with request/response contracts.
- `sync-scripts.md` — Operational scripts guide.
- `system-architecture.md` — Component architecture and data flow.
- `deployment-guide.md` — Deployment instructions.
- `telemetry.md` — Logging and metrics conventions.
- `code-standards.md` — Coding standards.
- `design-guidelines.md` — UI/UX specifications.
- `perf-memory.md` — Memory profiling guide.
- `codebase-summary.md` — This file.

### `sentry.*.config.ts` / `instrumentation*.ts`

Sentry error tracking and performance monitoring configuration.

### `public/`

This directory contains static assets that are served publicly, such as images and icons.

### `scripts/`

This directory contains utility scripts for the project, such as database initialization scripts.

### `docs/`

This directory contains all project documentation.
