# Codebase Summary

This document provides a summary of the Converge codebase structure.

## High-Level Overview

The project is a [Next.js](https://nextjs.org/) application written in [TypeScript](https://www.typescriptlang.org/). It uses [Prisma](https://www.prisma.io/) as an ORM for a Supabase PostgreSQL database. The code is organized into several main directories.

## Directory Structure

### `app/`

This directory contains the core of the Next.js application, following the App Router structure.

- **`app/layout.tsx` and `app/page.tsx`:** The main application layout and entry point.
- **`app/globals.css` and `app/page.module.css`:** Global and page-specific styles.
- **`app/api/`:** Contains all the backend API route handlers. Each subdirectory corresponds to an API endpoint.
  - `app/api/issues/`: Issue CRUD, edit, assign, bulk-status, attachments, relations, timelog.
  - `app/api/redmine/`: Handles connection to Redmine.
  - `app/api/sync/`: Handles the data synchronization logic.
  - `app/api/session/`: Manages user sessions.
  - `app/api/time-entries/`: Time entry list/update/delete.
  - `app/api/internal/`: Internal endpoints (`users`, `priorities`, `activities`).
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
- **`src/components/`:** Reusable React components.
  - `QuickActionsPanel.tsx`: Status, assign, and time logging panel.
  - `TimeTrackingPanel.tsx`: Time entry display and creation.
  - `AdvancedFilters.tsx`: Filter chips and advanced search.
  - `ProjectFilter.tsx`: Project-scoped filtering.
  - `ExportButton.tsx`: CSV/print export.
  - `DashboardWidgets.tsx`: Stats and metrics display.
  - `NotificationsPanel.tsx`: Notification management.
  - `ai/`: AI-powered search bar and issue actions.

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
