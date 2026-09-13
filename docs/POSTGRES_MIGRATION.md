# SQLite → PostgreSQL migration (Pi homelab)

Status: executed on Heimdal 2026-07-12 (Strategy B, full data carry-over). Left as a runbook for future re-runs (disaster recovery, a second instance,
etc.) — the steps below reflect what actually worked on this arm64 host, not the original untested plan. Read end-to-end before starting.

> **2026-07-16 update:** `docker-compose.postgres.yml` existed at the time this was written but has since been folded into `docker-compose.yml` (it's the only compose file now) — the commands below have been updated to drop the `-f docker-compose.postgres.yml` flag accordingly. That split file is *why* production silently ran on SQLite for days after this migration was "verified": both files shared `container_name: redmine-dashboard`, and a plain `docker compose up -d --build` (no `-f`) on the default file replaced the Postgres-backed container without anyone noticing. See IMPROVEMENTS.md §1.8.

## Why migrate

- SQLite locks under concurrent writes from the in-process poller, mobile API, and webhook deliveries.
- Pi disk pressure (Streamline log poller + bigger issue cache) makes WAL/vacuum management awkward.
- Production Postgres parity with the Prisma schema (`prisma/schema.prisma`) closes the dev/prod gap.

The local SQLite database is an **operational cache only**. Redmine is the single source of truth (`CLAUDE.md`). That fact drives the recommended
strategy below.

## Strategy A — Fresh-sync (recommended)

No data carry-over. Stand up Postgres, point Converge at it, let the sync poller rebuild the cache from Redmine. Mobile tokens and saved server-side
artefacts that don't exist in Redmine get rebuilt by users.

Trade-off: any AI summaries, internal notes, webhook subscriptions, audit logs, and saved views currently stored locally are dropped.

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
./scripts/backup.sh                  # writes backups/sqlite_backup_<timestamp>.db.gz
# `make backup` won't work here — it runs pg_dump via `docker compose exec postgres`,
# which requires the Postgres container to already be running (it isn't yet).
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

Compose forces the dashboard *container's* `DATABASE_URL` / `DIRECT_URL` to `DOCKER_POSTGRES_DATABASE_URL`, which points at the Postgres service by its Docker-network hostname (`postgres:5432`) — that hostname only resolves inside the Compose network. Anything run from the host directly (`psql`, a local Prisma CLI, `scripts/sqlite-to-postgres-copy.py` invoked outside a container) needs the host-reachable DSN instead: `postgresql://converge:<change-me>@localhost:${DOCKER_POSTGRES_PORT:-5433}/converge`.

5. **Create the schema on Postgres**

`prisma/migrations/` has no baseline migration — the earliest one only *alters* tables (`Issue`, etc.) that predate migration tracking on this
project (which has always used `prisma db push` in practice, confirmed by CI and prior sqlite dev-db fixes). Running `prisma migrate deploy` against
an empty database fails immediately with **P3018** ("relation Issue does not exist") on the very first migration. Use `db push` instead, then
baseline the migration history so future `migrate deploy` calls work:

```bash
docker compose run --rm dashboard \
  npx prisma db push --accept-data-loss   # safe: db push targets an empty database

# baseline: mark every existing migration as applied so future deploys
# don't try to replay history against a schema db push already created
for m in $(ls prisma/migrations | sort); do
  docker compose exec -T dashboard \
    npx prisma migrate resolve --applied "$m"
done
docker compose exec -T dashboard \
  npx prisma migrate status   # should say "Database schema is up to date!"
```

Skipping the baseline step prevents the dashboard from starting: its entrypoint fails closed when `prisma migrate deploy` cannot establish migration
history. Baseline before deployment so future migrations can apply safely.

6. **Trigger first sync from Redmine**

Either log into `/login` and let the in-process poller pick it up, or hit `POST /api/sync/redmine` (admin) to kick the bootstrap explicitly.

7. **Verify**

```bash
curl -s http://localhost:${DOCKER_PORT:-3000}/api/health
# expect "checks": { "database": { "ok": true }, ... }
# there's no literal db:"postgres" field — connectivity + the metrics block
# (issues/users/syncJobs counts) is the real signal

docker compose exec postgres \
  psql -U converge -d converge -c "select count(*) from \"Issue\";"
```

`Issue` row count should grow as the poller backfills. Streamline logs and mobile tokens populate as their respective producers run.

**Caddy note**: if `converge.opsio.space` (or your equivalent) proxies to `reverse_proxy dashboard:3000` using the Docker network alias (not a host port), no Caddy change is needed — the `dashboard` alias simply resolves to whichever dashboard container is currently up on the Compose network (`redmine-dashboard_default`, named after the checkout directory). Confirmed live 2026-07-12, back when this was still a two-compose-file setup: `docker exec caddy wget -qO- http://dashboard:3000/api/health` hit the new Postgres-backed container immediately after cutover, zero Caddy edits. There's only one compose file now (see the 2026-07-16 update above), so this isn't even a two-container-name collision anymore — just the normal single-stack case.

8. **Rollback** (if needed)

```bash
make down-pg
mv .env.sqlite.bak .env
make up
```

The SQLite cache snapshot from step 2 is at `backups/sqlite_backup_<timestamp>.db.gz` — restore by `gunzip`-ing it and copying the result over `prisma/dev.db` before `make up` if the bind mount wiped it.

## Strategy B — Carry over local-only data

Use this when you want internal notes, saved views, AI summaries, webhook subscriptions, or audit log history to survive the cut-over.

~~The cleanest path is **pgloader** in a one-shot Docker container.~~ **Does not work on this hardware** — `ghcr.io/dimitri/pgloader` only publishes an
`amd64` image, and this Pi has no qemu/binfmt emulation registered (confirmed 2026-07-12: `docker run --platform linux/amd64 hello-world` →
`exec format error`). Installing binfmt emulation was avoidable given the modest row counts here, so instead: **`scripts/sqlite-to-postgres-copy.py`**
— a small arm64-native data-only copy using Python's stdlib `sqlite3` + `psycopg2`, run inside a throwaway `python:3.12-alpine` container on the
Postgres network. Handles the same type gaps pgloader would (`Json`→`Int[]`
for `SavedView`, JSON columns → `jsonb`, `0`/`1`→`boolean`) plus one this sqlite db needed that pgloader wouldn't know about: **`DateTime` columns
are stored as epoch-millisecond integers, not ISO text**, in this specific database — the script converts them to proper timestamps automatically.

**Before starting, diff `prisma/schema.prisma` against `prisma/schema.dev.sqlite.prisma` for drift — the two have diverged and
`--with "data only"` copies against the *target* (Postgres) schema, so any mismatch below will drop data or fail the copy, not silently work:**

- ~~`WakaTimeDailySummary` exists only in `schema.dev.sqlite.prisma`~~ — **fixed 2026-07-12**: model + migration added to `prisma/schema.prisma`
  (`20260712000000_create_wakatime_daily_summary`).
- `SavedView.statusIds` / `priorityIds` are `Json` in the SQLite schema but native `Int[]` in the Postgres schema. A JSON-encoded array string won't
  auto-cast to a Postgres integer array — `scripts/sqlite-to-postgres-copy.py` handles this conversion automatically (`json.loads` → native list, which
  psycopg2 adapts to a Postgres array). **Checked 2026-07-12**: `SavedView` had 0 rows live, so this path was never actually exercised — re-verify the
  conversion if a future migration needs to carry real saved views over.
- **Column-name drift**: `server_side_rules_log.dbRequestsTime` maps to `db_requests_time` in the Postgres schema (`@map("db_requests_time")`) but
  has no equivalent `@map` in `schema.dev.sqlite.prisma` — the live sqlite column is literally named `dbRequestsTime`. `scripts/sqlite-to-postgres-copy.py`
  has a hardcoded alias for this one column; the sqlite schema file itself still has the drift (low priority to fix — sqlite is retired as the prod
  path after this migration, but would bite anyone still using `db push` against `schema.dev.sqlite.prisma` for local dev).
- The Streamline log tables (`server_side_rules_log`, `traces`, `mbu_logs`) gained `@db.VarChar(n)` / `@db.Decimal(10,3)` constraints only on the
  Postgres side. **Audited against live Heimdal data 2026-07-12**: every column is clean except `traces.code` (`VarChar(100)`) — one row (of 116)
  held a 22,852-char exception-trace source snippet, real data, not garbage. **Fixed**: widened `code` to `@db.Text` to match its `backtrace`/`context`
  siblings in the same model (`20260712000001_widen_trace_code_column`). If re-auditing after this, no further conversion needed for this table.

`SavedView`'s `Json`↔`Int[]` mismatch is the only item that was never data-tested end to end (0 live rows) — worth a dry run first if a future
migration has real saved views to carry over.

### Steps

1–3. Same as Strategy A (pre-flight, backup, `make down`).

4. **Start only Postgres** so we can target it:

```bash
docker compose up -d postgres
```

5. **Create and baseline the schema** — same `db push` + `migrate resolve` loop as Strategy A step 5, run against the empty database *before* loading any data. One difference: the `dashboard` container isn't running yet at this point in Strategy B (step 4 only started `postgres`), so use `docker compose run --rm dashboard` for every command in the loop, not `docker compose exec -T dashboard` — `exec` needs an already-running container, `run` starts a throwaway one.

6. **Run the copy script** against the snapshot SQLite file (find your network name via `docker network ls` — both compose files share one
   Compose project, so it's the same network `up -d postgres` already joined):

```bash
docker run --rm \
  -v "$PWD/scripts/sqlite-to-postgres-copy.py:/copy.py:ro" \
  -v "$PWD/backups/<your-snapshot>.db:/dev.db:ro" \
  --network redmine-dashboard_default \
  python:3.12-alpine \
  sh -c "pip install -q psycopg2-binary && python3 /copy.py /dev.db \
    \"postgresql://converge:<change-me>@postgres:5432/converge\""
```

Prints a per-table `sqlite_rows -> inserted` summary at the end — diff it against `sqlite3`/Python row counts on the source if anything looks off.
No sequence reset needed; every table uses `cuid` string ids.

7. **Truncate `LeaderLock`** — see Known footguns below, do this before starting the dashboard so a fresh lock gets acquired cleanly.

8. **Start the dashboard** and verify as in Strategy A step 7.

```bash
docker compose up -d dashboard
```

## After cut-over

- Disable the SQLite `make backup` cron (if you ran one) — the bind mount to `./prisma` is no longer authoritative.
- Add a Postgres dump cron, e.g.:

```bash
0 3 * * * docker compose -f /home/heimdal/converge/docker-compose.yml \
          exec -T postgres pg_dump -U converge converge \
          | gzip > /home/heimdal/converge/backups/pg.$(date +\%F).sql.gz
```

- Update Sentry/dashboard alerts that key on `db=sqlite`.

## Known footguns

- **Mobile tokens** are hashed via `APP_ENCRYPTION_KEY`. Keep the key identical across SQLite and Postgres or every issued token becomes
  invalid.
- **Audit log retention**: Postgres tables grow faster than SQLite did (no WAL compaction). Add a retention prune similar to
  `pruneOldLogs` in `src/lib/streamline-log-poller.ts:34`.
- **In-process poller leader lock** uses the `LeaderLock` table; lock rows from SQLite are stale after migration. Truncate it once:

```bash
docker compose exec postgres \
  psql -U converge -d converge -c 'TRUNCATE "LeaderLock";'
```

## Verification checklist

Verified 2026-07-12 on Heimdal (Strategy B):

- [x] `/api/health` `checks.database.ok: true` (no literal `db` field exists in the response — see the note under Strategy A step 7).
- [x] Issue queue loads: 148 rows, matched the sqlite source count exactly.
- [x] `AuditLog`/`InternalNote`/`WebhookSubscription` rows present (1 each, matching the source) and survived a dashboard container restart.
- [x] Streamline log poller (`ENABLE_STREAMLINE_LOG_POLLER=true`) fills `mbu_logs`/`server_side_rules_log`/`traces` — confirmed live inserts
      (`streamline_log_poller.tick.completed`) and its own retention prune (`streamline_log_poller.pruned`) both ran cleanly against Postgres.
- [ ] "No errors after 1 hour" — sqlite's "database is locked" doesn't apply to Postgres; re-check `docker compose logs dashboard` after an hour of
      normal operation as the Postgres-equivalent version of this check.
