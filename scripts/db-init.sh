#!/bin/sh
set -eu

DATABASE_URL_VALUE="${DATABASE_URL:-file:./dev.db}"

case "$DATABASE_URL_VALUE" in
  file:*)
    DB_PATH="${DATABASE_URL_VALUE#file:}"
    ;;
  *)
    echo "Unsupported DATABASE_URL for sqlite init: $DATABASE_URL_VALUE" >&2
    echo "Expected format: file:./path/to/db.sqlite" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" < prisma/init.sql

