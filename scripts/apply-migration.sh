#!/bin/bash
# Run migration directly with extended statement timeout
set -e

SCHEMA_DIR="$(dirname "$0")"
MIGRATION_FILE="$SCHEMA_DIR/20260414000000_add_local_issue_support/migration.sql"

# Extract DIRECT_URL from .env
export DIRECT_URL=$(grep '^DIRECT_URL=' .env | sed 's/DIRECT_URL=//;s/^"//;s/"$//')

echo "Applying migration to PostgreSQL..."
echo "Using DIRECT_URL: ${DIRECT_URL:0:50}..."

# Set extended statement timeout via connection parameter
DATABASE_URL_WITH_TIMEOUT="${DIRECT_URL}?options=-c%20statement_timeout%3D300000"

npx prisma db execute --file "$MIGRATION_FILE" --url "$DATABASE_URL_WITH_TIMEOUT"

echo "Migration SQL applied successfully."
