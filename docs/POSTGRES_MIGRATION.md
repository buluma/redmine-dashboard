# SQLite → PostgreSQL migration (Pi homelab)

Status: runbook. Read end-to-end before starting.

## Why migrate

- SQLite locks under concurrent writes from the in-process poller, mobile
  API, and webhook deliveries.
- Pi disk pressure (Streamline log poller + bigger issue cache) makes
  WAL/vacuum management awkward.
- Production Postgres parity with the Prisma schema (`prisma/schema.prisma`)
  closes the dev/prod gap.

The local SQLite database is an **operational cache only**. Redmine is the
single source of truth (`CLAUDE.md`). That fact drives the recommended
strategy below.

## Strategy A — Fresh-sync (recommended)

No data carry-over. Stand up Postgres, point Converge at it, let the sync
poller rebuild the cache from Redmine. Mobile tokens and saved server-side
artefacts that don't exist in Redmine get rebuilt by users.

Trade-off: any AI summaries, internal notes, webhook subscriptions, audit
logs, and saved views currently stored locally are dropped.

If those matter, use Strategy B.

### Steps

1. **Pre-flight on Pi**

```bash
ssh heimdal@10.0.0.212
df -h                                # confirm >= 2 GB free on the docker volume
docker --version                     # >= 24
docker compose version               # >= 2.20
```

2. **Snapshot SQLite (rollback safety)**

```bash
cd ~/converge                        # adjust to your checkout path
make backup                          # writes backups/dev.db.<timestamp>
ls -lh backups/ | tail -5
```

3. **Stop the SQLite stack**

```bash
make down
```

4. **Bring up Postgres + dashboard**

```bash
cp .env .env.sqlite.bak              # keep current env aside
cat >> .env <<'ENV'
DOCKER_POSTGRES_DB=converge
DOCKER_POSTGRES_USER=converge
DOCKER_POSTGRES_PASSWORD=<change-me>
DOCKER_POSTGRES_PORT=5433
DOCKER_POSTGRES_DATABASE_URL=postgresql://converge:<change-me>@postgres:5432/converge
ENV
make up-pg
```

Compose forces the dashboard's `DATABASE_URL` / `DIRECT_URL` to the Postgres
service (`postgres:5432`) inside the network, so the same `.env` works both
inside and outside the container.

5. **Run migrations against Postgres**

The dashboard image starts with the Postgres-schema Prisma client baked
in (`prisma/schema.prisma` per `Dockerfile`'s build arg). Apply pending
migrations once the postgres health check is green:

```bash
make logs-pg                         # wait for "postgres is ready" + dashboard "listening"
docker compose -f docker-compose.postgres.yml exec dashboard \
  npx prisma migrate deploy
```

6. **Trigger first sync from Redmine**

Either log into `/login` and let the in-process poller pick it up, or hit
`POST /api/sync/redmine` (admin) to kick the bootstrap explicitly.

7. **Verify**

```bash
curl -s http://localhost:3000/api/health
# expect { ok: true, db: "postgres", ... }

docker compose -f docker-compose.postgres.yml exec postgres \
  psql -U converge -d converge -c "select count(*) from \"Issue\";"
```

`Issue` row count should grow as the poller backfills. Streamline logs and
mobile tokens populate as their respective producers run.

8. **Rollback** (if needed)

```bash
make down-pg
mv .env.sqlite.bak .env
make up
```

The SQLite cache snapshot from step 2 is at `backups/dev.db.<timestamp>` —
restore by copying it over `prisma/dev.db` before `make up` if the bind
mount wiped it.

## Strategy B — Carry over local-only data

Use this when you want internal notes, saved views, AI summaries, webhook
subscriptions, or audit log history to survive the cut-over.

The cleanest path is **pgloader** in a one-shot Docker container.

**Before starting, diff `prisma/schema.prisma` against
`prisma/schema.dev.sqlite.prisma` for drift — the two have diverged and
`--with "data only"` copies against the *target* (Postgres) schema, so any
mismatch below will drop data or fail the copy, not silently work:**

- `WakaTimeDailySummary` exists only in `schema.dev.sqlite.prisma` — there is
  no Postgres table for it yet. Wakapi daily-summary rows have nowhere to
  land until this model is added to `prisma/schema.prisma` and migrated.
- `SavedView.statusIds` / `priorityIds` are `Json` in the SQLite schema but
  native `Int[]` in the Postgres schema. A JSON-encoded array string won't
  auto-cast to a Postgres integer array — saved views will likely fail to
  copy or need a manual conversion step (e.g. a post-load `UPDATE` casting
  the JSON text to `int[]`) before they're usable.
- The Streamline log tables (`ServerSideRulesLog`, `Trace`, `MbuLog`) gained
  `@db.VarChar(n)` / `@db.Decimal(10,3)` constraints only on the Postgres
  side (e.g. `logLevel` capped at VarChar(20), `host` at VarChar(255)). Any
  existing SQLite value exceeding those lengths/precision will hit a
  constraint violation during the copy, not get truncated quietly.

Resolve all three (add the missing table, reconcile the array/Json types,
confirm no oversized values) before running pgloader, or expect partial/failed
carry-over on exactly the data this strategy exists to preserve.

### Steps

1–3. Same as Strategy A (pre-flight, backup, `make down`).

4. **Start only Postgres** so we can target it:

```bash
docker compose -f docker-compose.postgres.yml up -d postgres
```

5. **Apply Prisma migrations against the empty database**

```bash
docker compose -f docker-compose.postgres.yml run --rm dashboard \
  npx prisma migrate deploy
```

6. **Run pgloader** against the snapshot SQLite file. From the Pi:

```bash
docker run --rm -v "$PWD/prisma:/data" \
  --network converge_default \
  ghcr.io/dimitri/pgloader:latest \
  pgloader \
    --with "data only" \
    sqlite:///data/dev.db \
    "postgresql://converge:<change-me>@postgres:5432/converge"
```

`--with "data only"` keeps Prisma's schema; pgloader just copies row data.

7. **Reset sequences** (Prisma uses BIGSERIAL for some tables):

```bash
docker compose -f docker-compose.postgres.yml exec postgres \
  psql -U converge -d converge -c "
    SELECT setval(pg_get_serial_sequence(table_name, column_name),
                  COALESCE(MAX(column_name)::bigint, 1))
    FROM information_schema.columns
    WHERE column_default LIKE 'nextval%';" || true
```

(If you get errors here, run the per-table form on whichever table failed.
Most installs do not need this step because Prisma uses `cuid` strings.)

8. **Start the dashboard** and verify as in Strategy A step 7.

```bash
docker compose -f docker-compose.postgres.yml up -d dashboard
```

## After cut-over

- Disable the SQLite `make backup` cron (if you ran one) — the bind mount
  to `./prisma` is no longer authoritative.
- Add a Postgres dump cron, e.g.:

```bash
0 3 * * * docker compose -f /home/heimdal/converge/docker-compose.postgres.yml \
          exec -T postgres pg_dump -U converge converge \
          | gzip > /home/heimdal/converge/backups/pg.$(date +\%F).sql.gz
```

- Update Sentry/dashboard alerts that key on `db=sqlite`.

## Known footguns

- **Mobile tokens** are hashed via `APP_ENCRYPTION_KEY`. Keep the key
  identical across SQLite and Postgres or every issued token becomes
  invalid.
- **Audit log retention**: Postgres tables grow faster than SQLite did
  (no WAL compaction). Add a retention prune similar to
  `pruneOldLogs` in `src/lib/streamline-log-poller.ts:34`.
- **In-process poller leader lock** uses the `LeaderLock` table; lock
  rows from SQLite are stale after migration. Truncate it once:

```bash
docker compose -f docker-compose.postgres.yml exec postgres \
  psql -U converge -d converge -c 'TRUNCATE "LeaderLock";'
```

## Verification checklist

- [ ] `/api/health` returns `db: "postgres"`.
- [ ] Issue queue loads with at least one row.
- [ ] `/ops/audit-logs` shows entries after a manual sync action.
- [ ] Webhook subscriptions list survives a dashboard restart.
- [ ] Streamline log poller fills `MbuLog`, `ServerSideRulesLog`, `Trace`
      tables (only if `ENABLE_STREAMLINE_LOG_POLLER=true`).
- [ ] No "database is locked" errors in `make logs-pg` after 1 hour.
