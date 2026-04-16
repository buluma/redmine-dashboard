#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.postgres.yml}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "${ROOT_DIR}")}"
COMPOSE_NETWORK="${COMPOSE_NETWORK:-${PROJECT_NAME}_default}"

SUPABASE_DATABASE_URL="${SUPABASE_DATABASE_URL:-${1:-}}"
if [ -z "${SUPABASE_DATABASE_URL}" ]; then
  echo "SUPABASE_DATABASE_URL is required." >&2
  echo "Usage: SUPABASE_DATABASE_URL='postgresql://...' $0" >&2
  echo "   or: $0 'postgresql://...'" >&2
  exit 1
fi

TARGET_DB="${DOCKER_POSTGRES_DB:-redmine_dashboard}"
TARGET_USER="${DOCKER_POSTGRES_USER:-postgres}"
TARGET_PASSWORD="${DOCKER_POSTGRES_PASSWORD:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
PG_TOOLS_IMAGE="${PG_TOOLS_IMAGE:-postgres:17-alpine}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/supabase_${TIMESTAMP}.dump"
LIST_FILE="${BACKUP_DIR}/supabase_${TIMESTAMP}.list"
FILTERED_LIST_FILE="${BACKUP_DIR}/supabase_${TIMESTAMP}.filtered.list"
DUMP_BASENAME="$(basename "${DUMP_FILE}")"
LIST_BASENAME="$(basename "${LIST_FILE}")"
FILTERED_LIST_BASENAME="$(basename "${FILTERED_LIST_FILE}")"

# pg_dump rejects Supabase pooler helper params like ?pgbouncer=true.
SOURCE_DATABASE_URL="$(printf '%s' "${SUPABASE_DATABASE_URL}" | sed -E 's/[?&]pgbouncer=[^&]*//g; s/\?&/?/g; s/[?&]$//')"

mkdir -p "${BACKUP_DIR}"

compose() {
  docker compose -f "${ROOT_DIR}/${COMPOSE_FILE}" "$@"
}

echo "Starting local Postgres container..."
if [ "${KEEP_LOCAL_POSTGRES_VOLUME:-0}" != "1" ]; then
  compose down -v >/dev/null 2>&1 || true
fi
compose up -d postgres

echo "Waiting for local Postgres..."
attempts=0
until compose exec -T postgres pg_isready -U "${TARGET_USER}" -d "${TARGET_DB}" >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "${attempts}" -ge 45 ]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi
  sleep 2
done

echo "Creating Supabase dump: ${DUMP_FILE}"
docker run --rm \
  -v "${BACKUP_DIR}:/dump" \
  "${PG_TOOLS_IMAGE}" \
  sh -lc "pg_dump \"${SOURCE_DATABASE_URL}\" -Fc -f /dump/${DUMP_BASENAME}"

echo "Resetting local target database: ${TARGET_DB}"
compose exec -T postgres sh -lc "
  export PGPASSWORD='${TARGET_PASSWORD}'
  dropdb --if-exists -U '${TARGET_USER}' '${TARGET_DB}'
  createdb -U '${TARGET_USER}' '${TARGET_DB}'
"

echo "Filtering unsupported Supabase extension objects (pg_graphql/supabase_vault)..."
docker run --rm \
  -v "${BACKUP_DIR}:/dump" \
  "${PG_TOOLS_IMAGE}" \
  sh -lc "pg_restore -l /dump/${DUMP_BASENAME} > /dump/${LIST_BASENAME}"
grep -Ev 'pg_graphql|supabase_vault| vault |graphql' "${LIST_FILE}" > "${FILTERED_LIST_FILE}"

echo "Restoring dump into local Docker Postgres..."
docker run --rm \
  --network "${COMPOSE_NETWORK}" \
  -e PGPASSWORD="${TARGET_PASSWORD}" \
  -v "${BACKUP_DIR}:/dump" \
  "${PG_TOOLS_IMAGE}" \
  sh -lc "pg_restore -h postgres -U '${TARGET_USER}' -d '${TARGET_DB}' --clean --if-exists --no-owner --no-privileges -L /dump/${FILTERED_LIST_BASENAME} /dump/${DUMP_BASENAME}"

echo "Import completed."
echo "Dump saved at: ${DUMP_FILE}"
echo "Restore list saved at: ${FILTERED_LIST_FILE}"
echo "Start app against local Postgres with:"
echo "  docker compose -f ${COMPOSE_FILE} up --build -d dashboard"
