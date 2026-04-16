# System Architecture

This document provides a high-level overview of the system architecture for Converge.

## Architectural Principles

- **Client-Server Model:** Converge is a web-based client-server application.
- **Source of Truth:** Redmine is the single source of truth for all issue data. The local database is considered an operational cache.
- **Security:** Security is a key consideration. API keys are encrypted at rest and are never exposed to the client.

## High-Level Diagram

```ascii
                 ┌───────────────────┐
                 │   User's Browser  │
                 └─────────┬─────────┘
                           │
  ┌────────────────┐       │       ┌────────────────┐
  │ Flutter Client │───────┘       │ Android Client │
  └────────────────┘               └────────────────┘
          │ (HTTPS, /api/mobile/v1/*) │
          │                         │
          ▼                         ▼
┌─────────────────────────────────────────────┐
│                Next.js Server               │
│                                             │
│ ┌───────────────┐      ┌──────────────────┐ │
│ │  Web Frontend │◀───▶ │   API Routes     │ │
│ │ (React Server │      │  (Next.js)       │ │
│ │  Components)  │      └─────────┬────────┘ │
│ └───────┬───────┘                │          │
│         │                        │          │
│         ▼                        │          │
│ ┌────────────────┐               │ (Prisma) │
│ │ Sync Queue     │               ▼          │
│ │ (IndexedDB)    │◀──────┐ ┌────────────────┐│
│ └───────┬────────┘       │ │ Push Subs      ││
│         │                │ └────────────────┘│
│         ▼                │ ┌────────────────┐│
│ ┌────────────────┐       │ │ Issues Cache   ││
│ │ Service Worker │───────┘ └────────────────┘│
│ └────────────────┘                           │
└─────────────────────────────────────────────┘
│                                             │
│  ┌───────────────┐      ┌────────────────┐  │
│  │ Sync Poller   │      │ Log Poller     │  │
│  │ (Leader Lock) │      │ (Leader Lock)  │  │
│  └───────────────┘      └────────────────┘  │
└─────────────────────────────────────────────┘
          │                        │
          │                        │ (Streamline API)
          ▼                        ▼
┌───────────────────┐      ┌───────────────────┐
│   Redmine Server  │      │ Streamline Server │
└───────────────────┘      └───────────────────┘
```

## Components

### 1. Web Frontend

- **Framework:** [Next.js](https://nextjs.org/) with the App Router.
- **Rendering:** Uses React Server Components for rendering the UI.
- **Functionality:** Provides the user interface for viewing and interacting with Redmine issues.

### 2. Mobile Clients

- **Flutter:** A cross-platform mobile application built with Flutter.
- **Native Android:** A reference implementation for a native Android client using Jetpack Compose.
- **Functionality:** Both clients provide a mobile-friendly interface for managing Redmine issues, including viewing issues, allowed transitions, comments, attachments, relations, and GitHub links. They interact with the backend via a dedicated set of mobile API endpoints.

### 3. API Routes

- **Framework:** Next.js API Routes.
- **Functionality:**
  - Exposes endpoints for session management, issue data, mutations, synchronization, time-entry lifecycle operations, attachments, and relations.
  - **AI Tool Calls:** Provides endpoints for LLM-driven actions (`/api/chat`, `/api/chat/execute-tools`) with a multi-step confirmation loop.
  - Provides a dedicated set of token-authenticated endpoints for mobile clients under `/api/mobile/v1/*`.
  - Enforces rate limiting on mutation endpoints.
- **Validation:** Zod schemas are used to validate incoming request data.

### 4. Database

- **Engine:** SQLite (as a starting point for the MVP).
- **ORM:** [Prisma](https://www.prisma.io/) is used for database access.
- **Purpose:** Acts as an operational cache for Redmine data to provide fast reads for the user. It is not the source of truth.

### 5. Synchronization Service

- **Implementation:** An in-process poller that runs within the Next.js server.
- **Polling:** Periodically fetches data from the Redmine API to keep the local cache up to date. The default polling interval is 5 minutes.
- **Synced Redmine surfaces:** `issues`, `issue_statuses`, enumerations (time entry activities + issue priorities), issue `attachments`, issue `relations`, `allowed_statuses`, and `children`.
- **Leader Lock:** A leader lock mechanism is used to ensure that only one instance of the poller is active at a time in a multi-instance environment.

### 6. Streamline Log Poller

- **Implementation:** A dedicated in-process poller for auto-fetching logs from the Streamline API.
- **Polling:** Periodically fetches MBU logs, Server Side Rules logs, and Traces from Streamline. Default interval is 5 minutes.
- **Leader Lock:** Uses a separate leader lock (`streamline-log-poller`) to ensure only one instance runs the log fetcher.
- **Upsert Behavior:** Records are upserted by `id + environment + host`, so duplicate records are automatically skipped.
- **Tables populated:** `MbuLog`, `ServerSideRulesLog`, `Trace`.
- **Viewing logs:** Available in the `/heimdall` dashboard.

### 7. PWA Sync Queue

- **Implementation:** Client-side persistence using IndexedDB (via `idb` library).
- **Queuing:** All mutations (status, time, comments) check `navigator.onLine`. If offline, they are enqueued with type/payload/timestamp.
- **Service Worker:** Listens for `sync` events (Background Sync API). When triggered, it flushes the IndexedDB queue to the backend.
- **Fallbacks:** The UI also attempts to flush the queue on manual "online" events or periodic check intervals.

### 8. Push Notification Service

- **Lifecycle:** Users subscribe via browser prompts; VAPID tokens are stored in the `PushSubscription` table.
- **Server:** A `web-push` utility handles payload encryption and delivery to browser push services (FCM, Autopush, etc.).
- **Triggers:** Automated triggers in `sync.ts` fire notifications for new assignments or critical status changes.

## Technology Stack

- **Framework:** Next.js App Router
- **Database:** Prisma Client + SQLite
- **Validation:** Zod
- **Synchronization:** In-process sync poller with a leader lock
- **AI Tool Calls:** Multi-step confirmation loop using OpenAI-format function calling

## AI Tool-Calling Architecture

The AI assistant at `/chat` uses a structured tool-calling implementation to perform Redmine actions.

### 1. Tool Engine (`src/lib/ai-tools.ts`)
Defines Redmine operations (update status, log time, close issue) in OpenAI-compatible JSON Schema. It includes a dispatcher that executes these calls via `RedmineClient` after validation.

### 2. Confirmation Loop
To prevent accidental data mutation, the system uses a two-step confirmation process:
1. **Selection:** The LLM proposes actions. The `/api/chat` route identifies "mutating" tools and returns them as `pendingToolCalls`.
2. **Execution:** The client displays a **Confirmation Card**. Once the user clicks "Confirm", the client calls `/api/chat/execute-tools`, which performs the actual Redmine update and returns a summary.

Read-only tools (search, get issue) are **auto-executed** during the first step to provide immediate context to the model.

## Production Considerations

The current implementation uses SQLite and an in-process poller, which is suitable for a minimal viable product or a single-user deployment. For a larger-scale production environment, the following changes are recommended:

- **Database:** Switch from SQLite to a more robust database like PostgreSQL.
- **Synchronization:** Move the synchronization logic out of the web server process and into an external, dedicated scheduler (e.g., a cron job, or a service like `node-cron` running in a separate container).
