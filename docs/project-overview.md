# Project Overview

NRCC (Nasc Redmine Command Center) is a Next.js + Prisma dashboard designed to provide a fast and efficient interface for managing Redmine issues. It is aimed at users who are assigned issues in Redmine and need a streamlined way to interact with them.

The system works by syncing Redmine issues to a local database, providing fast local reads from this cache. All state changes are ultimately persisted back to Redmine, which remains the single source of truth.

## Core Features

- **Reporting:** A reports page provides insights with trends, a heatmap of activity, data drilldowns, and a CSV export feature.

## Mobile Support

NRCC provides support for mobile clients, allowing users to manage their Redmine issues on the go.

- **Clients:** The project includes a ready-to-build [Flutter application](../mobile/flutter_nrcc) and provides guidance for creating a [native Android client](./mobile/android.md).
- **Secure Pairing:** Mobile clients can be paired securely using a token-based authentication system, avoiding the need for browser cookies.
- **Mobile-Specific API:** A dedicated set of endpoints under `/api/mobile/v1/` is available for mobile clients.
- **Core Functionality:** Mobile users can post comments and manage GitHub links from their devices.

## Technology Stack

- **Framework:** Next.js (App Router)
- **Database:** Prisma Client with SQLite (for the MVP).
- **Validation:** Zod for data validation.
- **Synchronization:** An in-process poller with a leader lock mechanism to handle data synchronization.
