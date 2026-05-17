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

## Migrating from SQLite to PostgreSQL

For Pi homelab installs that started on SQLite, see
[`docs/POSTGRES_MIGRATION.md`](docs/POSTGRES_MIGRATION.md) for the
end-to-end runbook (pre-flight, snapshot, swap, verify, rollback).

## Supabase Import To Local Docker Postgres

Use this when you want your Docker app to run against a local Postgres copy of Supabase data.

1. Import Supabase into local Docker Postgres:

```bash
make import-supabase SUPABASE_DATABASE_URL="postgresql://user:pass@host:5432/postgres"
```

Note: the import flow excludes Supabase-managed extension objects (`pg_graphql`, `supabase_vault`) so restore works on standard Postgres images.

2. Start the Postgres-mode stack:

```bash
make up-pg
```

3. Tail logs:

```bash
make logs-pg
```

4. Stop Postgres-mode stack:

```bash
make down-pg
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
- Docker Compose forces `DATABASE_URL=file:./prisma/dev.db` for the container, so it uses local `./prisma` data and not remote Supabase/Postgres values from `.env`.
- Docker build generates Prisma client from `prisma/schema.dev.sqlite.prisma` for SQLite compatibility.
- Postgres mode uses `docker-compose.postgres.yml` and `DATABASE_URL=${DOCKER_POSTGRES_DATABASE_URL}`.
- Plain HTTP deployments, including Pi/homelab access by IP and port, need `SECURE_COOKIES=false`. If this is missing while `NODE_ENV=production`, login succeeds on the server but the browser discards the `rd_session` cookie and redirects back to `/login`.
- HTTPS-only deployments can set `SECURE_COOKIES=true`.
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
