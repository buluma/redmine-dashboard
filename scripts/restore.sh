#!/bin/bash
#
# restore.sh - Database restore script for Docker production
# Usage: ./scripts/restore.sh <backup_file>
#
# Restores database from a backup file.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    ls -la "$PROJECT_DIR/backups/" 2>/dev/null || echo "No backup directory found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

log_info "Restoring from: $BACKUP_FILE"

# Detect backup type
if [[ "$BACKUP_FILE" == *.sql ]]; then
    log_info "PostgreSQL backup detected"
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL not set for PostgreSQL restore"
        exit 1
    fi
    
    log_warn "This will overwrite the current database!"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    log_info "Restoring PostgreSQL database..."
    psql "$DATABASE_URL" < "$BACKUP_FILE"
    log_info "PostgreSQL restore complete!"
    
elif [[ "$BACKUP_FILE" == *.gz ]]; then
    log_info "Compressed SQLite backup detected"
    log_warn "This will overwrite the current database!"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    # Decompress to temp file
    TEMP_FILE=$(mktemp)
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    
    # Backup current db
    if [ -f "$PROJECT_DIR/prisma/dev.db" ]; then
        CP_DATE=$(date +%Y%m%d_%H%M%S)
        cp "$PROJECT_DIR/prisma/dev.db" "$PROJECT_DIR/prisma/dev.db.pre-restore_$CP_DATE"
        log_info "Current database backed up to: prisma/dev.db.pre-restore_$CP_DATE"
    fi
    
    # Restore
    cp "$TEMP_FILE" "$PROJECT_DIR/prisma/dev.db"
    rm "$TEMP_FILE"
    log_info "SQLite restore complete!"
    
elif [[ "$BACKUP_FILE" == *.db ]]; then
    log_info "SQLite backup detected"
    log_warn "This will overwrite the current database!"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    # Backup current db
    if [ -f "$PROJECT_DIR/prisma/dev.db" ]; then
        CP_DATE=$(date +%Y%m%d_%H%M%S)
        cp "$PROJECT_DIR/prisma/dev.db" "$PROJECT_DIR/prisma/dev.db.pre-restore_$CP_DATE"
        log_info "Current database backed up to: prisma/dev.db.pre-restore_$CP_DATE"
    fi
    
    cp "$BACKUP_FILE" "$PROJECT_DIR/prisma/dev.db"
    log_info "SQLite restore complete!"
    
else
    log_error "Unknown backup file format"
    exit 1
fi

log_info "Restore complete! 💾"