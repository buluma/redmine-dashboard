# System Architecture

This document provides a high-level overview of the system architecture for the Nasc Redmine Command Center (NRCC).

## Architectural Principles

- **Client-Server Model:** NRCC is a web-based client-server application.
- **Source of Truth:** Redmine is the single source of truth for all issue data. The local database is considered an operational cache.
- **Security:** Security is a key consideration. API keys are encrypted at rest and are never exposed to the client.

## High-Level Diagram

```ascii
                 ┌───────────────────┐
                 │   User's Browser  │
                 └─────────┬─────────┘
                           │ (HTTPS)
                           ▼
┌─────────────────────────────────────────────┐
│                Next.js Server               │
│                                             │
│ ┌───────────────┐      ┌──────────────────┐ │
│ │  Web Frontend │◀───▶ │   API Routes     │ │
│ │ (React Server │      │  (Next.js)       │ │
│ │  Components)  │      └─────────┬────────┘ │
│ └───────────────┘                │          │
│                                  │ (Prisma) │
│                                  ▼          │
│ ┌───────────────┐      ┌──────────────────┐ │
│ │ In-process    │      │      SQLite      │ │
│ │ Sync Poller   │◀────▶│    Database      │ │
│ └───────┬───────┘      │(Operational Cache)│ │
│         │              └──────────────────┘ │
└─────────┼───────────────────────────────────┘
          │
          │ (Redmine API)
          ▼
┌───────────────────┐
│   Redmine Server  │
└───────────────────┘
```

## Components

### 1. Web Frontend

- **Framework:** [Next.js](https://nextjs.org/) with the App Router.
- **Rendering:** Uses React Server Components for rendering the UI.
- **Functionality:** Provides the user interface for viewing and interacting with Redmine issues.

### 2. API Routes

- **Framework:** Next.js API Routes.
- **Functionality:**
  - Handles all communication between the frontend and the backend.
  - Exposes endpoints for session management, issue data, mutations, and synchronization.
  - Enforces rate limiting on mutation endpoints.
- **Validation:** Zod schemas are used to validate incoming request data.

### 3. Database

- **Engine:** SQLite (as a starting point for the MVP).
- **ORM:** [Prisma](https://www.prisma.io/) is used for database access.
- **Purpose:** Acts as an operational cache for Redmine data to provide fast reads for the user. It is not the source of truth.

### 4. Synchronization Service

- **Implementation:** An in-process poller that runs within the Next.js server.
- **Polling:** Periodically fetches data from the Redmine API to keep the local cache up to date. The default polling interval is 60 seconds.
- **Leader Lock:** A leader lock mechanism is used to ensure that only one instance of the poller is active at a time in a multi-instance environment.

## Technology Stack

- **Framework:** Next.js App Router
- **Database:** Prisma Client + SQLite
- **Validation:** Zod
- **Synchronization:** In-process sync poller with a leader lock

## Production Considerations

The current implementation uses SQLite and an in-process poller, which is suitable for a minimal viable product or a single-user deployment. For a larger-scale production environment, the following changes are recommended:

- **Database:** Switch from SQLite to a more robust database like PostgreSQL.
- **Synchronization:** Move the synchronization logic out of the web server process and into an external, dedicated scheduler (e.g., a cron job, or a service like `node-cron` running in a separate container).
