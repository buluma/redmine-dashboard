# Converge

Converge is a unified operations dashboard connecting Redmine, Slack, AI, and more.
It provides fast local reads from a synced cache, with all final state owned by Redmine.

Originally built as a Redmine command center, Converge has evolved into a powerful ops platform with:

- **Redmine Integration** — Sync and manage issues with AI-powered summaries
- **Full-Text Search** — fast fuzzy search across issues, descriptions, and projects
- **Slack Integration** — Monitor channels and send notifications
- **AI Insights** — Issue summarization, semantic search, and chat
- **RBAC** — Role-based access control (Admin, Editor, User, Viewer)
- **Audit Logging** — Track user actions, role changes, and internal notes
- **Mobile Support** — Token-authenticated mobile API (v1)
- **PWA / Offline** — Installable app with IndexedDB cache, offline viewing, and queued sync
- **Docker Production** — Multi-stage build, healthchecks, backup/restore scripts
- **WakaTime Integration** — Coding time tracking

## Documentation

For detailed documentation, please see the **[docs/README.md](./docs/README.md)** file.

The documentation includes:

- **[Project Overview](./docs/project-overview.md)**
- **[System Architecture](./docs/system-architecture.md)**
- **[Deployment Guide](./docs/deployment-guide.md)**
- **[Code Standards](./docs/code-standards.md)**
- **[Telemetry Conventions](./docs/telemetry.md)**
- **[Memory Profiling Guide](./docs/perf-memory.md)**
- **[API Reference](./docs/api-reference.md)**
- **[Codebase Summary](./docs/codebase-summary.md)**
- **[Design Guidelines](./docs/design-guidelines.md)**
- **[Debugging & Streamline Logs](./debugging/README.md)** — Fetch Streamline application logs and import them into Supabase for troubleshooting.

Mobile/Android integration is available through token-authenticated endpoints under `/api/mobile/v1/*`.

## Quick Start

### Local Setup

1.  **Install dependencies:** `npm install`
2.  **Configure environment:** `cp .env.example .env` (and fill in the values)
3.  **Initialize database:** `npm run db:init`
4.  **Start application:** `npm run dev`

### Docker Setup

```bash
cp .env.example .env
make up
```

For more details, see the [Deployment Guide](./docs/deployment-guide.md).

### Production Docker

For production deployments with healthchecks, backups, and zero-downtime deploys:

```bash
# Build and start production stack
docker compose -f docker-compose.yml up -d

# Backup database
./scripts/backup.sh

# Restore from backup
./scripts/restore.sh backup-2026-04-14.sql
```

## RBAC (Role-Based Access Control)

Converge supports four roles with progressively restricted permissions:

| Role | Access |
|------|--------|
| **Admin** | Full access: ops pages, user management, role changes, audit logs |
| **Editor** | View ops pages, audit logs; cannot manage users |
| **User** | Standard dashboard access |
| **Viewer** | Read-only dashboard access |

Roles are managed at `/ops/users` (Admin only).

## PWA & Offline

Converge is installable as a Progressive Web App. When offline:

- Previously viewed issues are cached in IndexedDB and viewable
- Status changes, comments, and time entries are queued and auto-synced on reconnect
- An offline banner appears at the top when both `navigator.onLine` and server ping fail

Install from Chrome/Edge: click the install icon in the address bar, or "Add to Home Screen" on Android.

## Testing

### Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

The project uses **Vitest** with `jsdom` environment for React component testing.

| Category | Coverage |
|----------|----------|
| Library utilities | auth, crypto, db, rate-limit, session, mobile-auth, sync, schemas, redmine-text-format |
| API routes | health, AI (summarize/categorize/chat), issues (assign/favorite), Slack (notify/thread/test), mobile v1, mutations, sync jobs, GitHub links |
| React components | ChatFab, AiSearchBar, AiButton, ErrorBoundary, ThemeProvider, ThemeToggle |

### Test File Conventions

- Tests live alongside source code in `__tests__/` directories
- TypeScript tests: `*.test.ts`
- React component tests: `*.test.tsx` (uses `@testing-library/react`)
- Globals enabled: `describe`, `it`, `expect`, `vi` available without import

### Adding New Tests

1. Create `__tests__/` directory next to the source file
2. Name test files: `<feature>.test.ts` or `<Component>.test.tsx`
3. Mock external dependencies (database, API calls, LLM) using `vi.mock()`
4. Test happy path, edge cases, and error states

For more details, see the [Code Standards](./docs/code-standards.md).
