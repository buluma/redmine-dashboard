# Codebase Summary

This document provides a summary of the NRCC codebase structure.

## High-Level Overview

The project is a [Next.js](https://nextjs.org/) application written in [TypeScript](https://www.typescriptlang.org/). It uses [Prisma](https://www.prisma.io/) as an ORM for an SQLite database. The code is organized into several main directories.

## Directory Structure

### `app/`

This directory contains the core of the Next.js application, following the App Router structure.

- **`app/layout.tsx` and `app/page.tsx`:** The main application layout and entry point.
- **`app/globals.css` and `app/page.module.css`:** Global and page-specific styles.
- **`app/api/`:** Contains all the backend API route handlers. Each subdirectory corresponds to an API endpoint.
  - `app/api/issues/`: Handles issue-related logic.
  - `app/api/redmine/`: Handles connection to Redmine.
  - `app/api/sync/`: Handles the data synchronization logic.
  - `app/api/session/`: Manages user sessions.
- **`app/ops/`:** The UI for the sync operations page.
- **`app/reports/`:** The UI for the reports page.

### `src/`

This directory contains reusable library code, components, and other source files that are not directly part of the Next.js routing structure.

- **`src/lib/`:** A collection of library modules used across the application.
  - `auth.ts`: Authentication-related functions.
  - `db.ts`: Prisma client instance.
  - `redmine.ts`: Functions for interacting with the Redmine API.
  - `sync.ts`: Core synchronization logic.
  - `schemas.ts`: Zod schemas for data validation.
  - `session.ts`: Session management utilities.
- **`src/components/`:** Reusable React components (currently empty, but this is where they would go).

### `mobile/`

This directory contains the source code for the mobile applications.

- **`mobile/flutter_nrcc/`:** A complete Flutter project for the cross-platform mobile app.

### `prisma/`

This directory contains all Prisma-related files.

- **`prisma/schema.prisma`:** The Prisma schema file, which defines the database models.
- **`prisma/init.sql`:** An SQL script to initialize the database.

### `public/`

This directory contains static assets that are served publicly, such as images and icons.

### `scripts/`

This directory contains utility scripts for the project, such as database initialization scripts.

### `docs/`

This directory contains all project documentation.
