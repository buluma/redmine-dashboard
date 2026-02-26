# Project Overview

NRCC (Nasc Redmine Command Center) is a Next.js + Prisma dashboard designed to provide a fast and efficient interface for managing Redmine issues. It is aimed at users who are assigned issues in Redmine and need a streamlined way to interact with them.

The system works by syncing Redmine issues to a local database, providing fast local reads from this cache. All state changes are ultimately persisted back to Redmine, which remains the single source of truth.

## Core Features

- **Redmine Integration:** Connect to a Redmine instance using a base URL and API key.
- **Issue Management:**
  - View issues assigned to the logged-in user.
  - Filter, sort, and search through issues.
  - Create and use saved views for common queries.
- **Issue Updates:**
  - Update the status of a single issue.
  - Perform bulk status updates on selected issues.
- **Collaboration:**
  - Add comments to issues.
  - Log time spent on issues.
- **GitHub Integration:** Link Redmine issues to GitHub repositories, issues, and pull requests.
- **Markdown Support:** Renders issue descriptions, comments, and time-log notes as Markdown for better readability.
- **Automated Sync:**
  - A polling mechanism automatically syncs data from Redmine every 60 seconds.
  - A manual "Force Refresh" option is available for a full, on-demand sync.
- **Operational Visibility:**
  - A header display shows the current sync health, status, and any recent errors.
  - A dedicated Sync Ops page (`/ops`) allows for managing the sync lifecycle.
- **Reporting:** A reports page provides insights with trends, a heatmap of activity, data drilldowns, and a CSV export feature.

## Technology Stack

- **Framework:** Next.js (App Router)
- **Database:** Prisma Client with SQLite (for the MVP).
- **Validation:** Zod for data validation.
- **Synchronization:** An in-process poller with a leader lock mechanism to handle data synchronization.
