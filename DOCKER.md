# Docker Usage

This project supports local production-style runs with Docker and Docker Compose.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- `.env` file present in repo root (`cp .env.example .env`)

## Quick Start

1. Build and start:

```bash
make up
```

2. Open dashboard:

- [http://localhost:3000](http://localhost:3000)

3. Tail logs:

```bash
make logs
```

4. Stop:

```bash
make down
```

## Data Persistence

- SQLite DB path in container: `file:./prisma/dev.db`
- Host bind mount: `./prisma -> /app/prisma`
- Result: issue cache and sync state survive container recreation.

## Common Commands

Rebuild after dependency or Dockerfile changes:

```bash
make up
```

Restart service only:

```bash
make restart
```

Run one-off command in container:

```bash
make shell
```

Show available targets:

```bash
make help
```

## Environment Notes

- Compose loads `.env` via `env_file`.
- `docker-compose.yml` also includes fallback defaults for required variables.
- Docker DB URL uses `DOCKER_DATABASE_URL` (not `DATABASE_URL`) to avoid clashing with local non-Docker dev settings.
- For first-run Redmine bootstrap, set:
  - `REDMINE_BASE_URL`
  - `REDMINE_API_KEY`

## Reset Local Docker Data

To reset only SQLite cache/state:

```bash
make reset-db
```

To reset containers/networks:

```bash
docker compose down --remove-orphans
```
