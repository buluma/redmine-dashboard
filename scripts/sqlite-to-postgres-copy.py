#!/usr/bin/env python3
# Usage: python3 sqlite-to-postgres-copy.py <sqlite-db-path> <postgres-dsn>
# Data-only copy for docs/POSTGRES_MIGRATION.md Strategy B. Replaces pgloader,
# which has no arm64 build and cannot run on a Raspberry Pi host at all.
import datetime
import json
import sqlite3
import sys

import psycopg2
import psycopg2.extras

TIMESTAMP_TYPES = ("timestamp without time zone", "timestamp with time zone")

# known sqlite/postgres column-name drift (sqlite schema is missing an @map
# that the postgres schema has) — server_side_rules_log.dbRequestsTime maps
# to db_requests_time on the postgres side
COLUMN_ALIASES = {
    ("server_side_rules_log", "dbRequestsTime"): "db_requests_time",
}

SQLITE_PATH = sys.argv[1]
PG_DSN = sys.argv[2]

sconn = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
sconn.row_factory = sqlite3.Row
scur = sconn.cursor()

pconn = psycopg2.connect(PG_DSN)
pconn.autocommit = False
pcur = pconn.cursor()

scur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'")
tables = [r[0] for r in scur.fetchall()]

pcur.execute(
    "SELECT table_name, column_name, data_type, udt_name "
    "FROM information_schema.columns WHERE table_schema='public'"
)
pg_columns = {}
for table_name, column_name, data_type, udt_name in pcur.fetchall():
    pg_columns.setdefault(table_name, {})[column_name] = (data_type, udt_name)

# defer FK enforcement so tables can load in any order (converge's DOCKER_POSTGRES_USER
# is the initdb bootstrap superuser, so this is permitted)
pcur.execute("SET session_replication_role = 'replica'")

summary = []
for table in tables:
    if table not in pg_columns:
        print(f"SKIP {table}: no matching postgres table")
        continue

    scur.execute(f'SELECT * FROM "{table}"')
    rows = scur.fetchall()
    if not rows:
        summary.append((table, 0, 0))
        continue

    col_names = rows[0].keys()
    pg_cols = pg_columns[table]
    mapped_names = [COLUMN_ALIASES.get((table, c), c) for c in col_names]
    unknown = [c for c, m in zip(col_names, mapped_names) if m not in pg_cols]
    if unknown:
        print(f"WARN {table}: sqlite columns not found in postgres, skipping them: {unknown}")
    use_cols = [(c, m) for c, m in zip(col_names, mapped_names) if m in pg_cols]

    values = []
    for row in rows:
        out = []
        for c, m in use_cols:
            v = row[c]
            data_type, udt_name = pg_cols[m]
            if v is None:
                out.append(None)
            elif data_type == "ARRAY":
                out.append(json.loads(v) if isinstance(v, str) else v)
            elif data_type == "jsonb":
                out.append(psycopg2.extras.Json(json.loads(v) if isinstance(v, str) else v))
            elif data_type == "boolean":
                out.append(bool(v))
            elif data_type in TIMESTAMP_TYPES and isinstance(v, int):
                # this sqlite db stores DateTime as epoch milliseconds, not ISO text
                out.append(datetime.datetime.fromtimestamp(v / 1000, tz=datetime.timezone.utc))
            else:
                out.append(v)
        values.append(tuple(out))

    col_list = ", ".join(f'"{m}"' for c, m in use_cols)
    placeholder_row = "(" + ", ".join(["%s"] * len(use_cols)) + ")"
    sql = f'INSERT INTO "{table}" ({col_list}) VALUES %s'
    psycopg2.extras.execute_values(pcur, sql, values, template=placeholder_row, page_size=500)
    summary.append((table, len(rows), len(rows)))

pcur.execute("SET session_replication_role = 'origin'")
pconn.commit()

print("\n=== copy summary (table, sqlite_rows, inserted) ===")
for table, src, ins in summary:
    print(f"{table}: {src} -> {ins}")

pcur.close()
pconn.close()
sconn.close()
