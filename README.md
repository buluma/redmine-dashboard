# Nasc Redmine Command Center (NRCC)

NRCC is a Next.js + Prisma dashboard for Redmine issues assigned to the signed-in user.
It provides fast local reads from a synced cache, with all final state owned by Redmine.

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
