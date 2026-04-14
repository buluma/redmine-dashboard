#!/bin/bash
#
# backup.sh - Database backup script for Docker production
# Usage: ./scripts/backup.sh [output_dir]
#
# Creates timestamped backup of the SQLite database.
# Can also backup from external DATABASE_URL (PostgreSQL).
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${1:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Determine database type
if [[ "$DATABASE_URL" == *"postgresql"* ]] || [[ "$DATABASE_URL" == *"postgres"* ]]; then
    log_info "Detected PostgreSQL database"
    DB_TYPE="postgresql"
else
    log_info "Detected SQLite database"
    DB_TYPE="sqlite"
fi

case "$DB_TYPE" in
    postgresql)
        BACKUP_FILE="$OUTPUT_DIR/postgres_backup_$TIMESTAMP.sql"
        log_info "Creating PostgreSQL backup: $BACKUP_FILE"
        
        if command -v pg_dump &> /dev/null; then
            pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
            log_info "PostgreSQL backup complete: $BACKUP_FILE"
        else
            log_error "pg_dump not found. Install PostgreSQL client."
            exit 1
        fi
        ;;
    sqlite)
        # Check for Docker environment
        if [ -n "$DOCKER" ] || [ -f "$PROJECT_DIR/prisma/dev.db" ]; then
            DB_FILE="$PROJECT_DIR/prisma/dev.db"
        else
            log_error "SQLite database not found at $PROJECT_DIR/prisma/dev.db"
            exit 1
        fi
        
        BACKUP_FILE="$OUTPUT_DIR/sqlite_backup_$TIMESTAMP.db"
        log_info "Creating SQLite backup: $BACKUP_FILE"
        
        if [ -f "$DB_FILE" ]; then
            cp "$DB_FILE" "$BACKUP_FILE"
            gzip "$BACKUP_FILE"
            BACKUP_FILE="${BACKUP_FILE}.gz"
            log_info "SQLite backup complete: $BACKUP_FILE"
        else
            log_error "Database file not found: $DB_FILE"
            exit 1
        fi
        ;;
esac

# Create backup metadata
METADATA_FILE="$OUTPUT_DIR/backup_metadata_$TIMESTAMP.json"
cat > "$METADATA_FILE" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "type": "$DB_TYPE",
  "backup_file": "$(basename $BACKUP_FILE)",
  "database_url": "${DATABASE_URL:0:20}...",
  "hostname": "$(hostname)",
  "node_env": "$NODE_ENV"
}
EOF

log_info "Backup metadata: $METADATA_FILE"

# Clean old backups (keep last 7)
log_info "Cleaning old backups (keeping last 7)..."
cd "$OUTPUT_DIR"
ls -t sqlite_backup_*.db.gz postgres_backup_*.sql 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

# Show backup summary
log_info "=== Backup Summary ==="
ls -lh "$OUTPUT_DIR" | tail -5

echo ""
log_info "Backup complete! 💾"