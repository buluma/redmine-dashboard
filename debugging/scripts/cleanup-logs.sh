#!/bin/bash
# ============================================================================
# Streamline Debug Logs Cleanup Script
# Description: Cleans up old log files from debugging/logs/ directory
# Usage: ./scripts/cleanup-logs.sh [options]
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$DEBUG_DIR/logs"

# Default values
MAX_AGE_DAYS=7
DRY_RUN=false
VERBOSE=false

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# Functions
# ============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Clean up old log files from debugging/logs/ directory

Options:
  -d, --days DAYS           Maximum age in days (default: 7)
  -n, --dry-run             Show what would be deleted without deleting
  -v, --verbose             Show detailed information
  -f, --force               Skip confirmation prompt
  -h, --help                Show this help message

Examples:
  # Preview files older than 7 days (dry run)
  $(basename "$0") --dry-run

  # Delete files older than 14 days
  $(basename "$0") --days 14

  # Force delete without confirmation
  $(basename "$0") --force

  # Verbose output
  $(basename "$0") --verbose

EOF
    exit 0
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Parse command line arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--days)
            MAX_AGE_DAYS="$2"
            shift 2
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# ============================================================================
# Main execution
# ============================================================================

main() {
    echo ""
    echo "============================================"
    echo "  Streamline Debug Logs Cleanup"
    echo "============================================"
    echo ""

    # Check if logs directory exists
    if [[ ! -d "$LOGS_DIR" ]]; then
        log_error "Logs directory not found: $LOGS_DIR"
        exit 1
    fi

    # Find old log files
    log_info "Searching for log files older than $MAX_AGE_DAYS days..."
    
    local old_files
    old_files=$(find "$LOGS_DIR" -name "*.json" -type f -mtime +$MAX_AGE_DAYS 2>/dev/null || true)
    
    if [[ -z "$old_files" ]]; then
        log_success "No old log files found. Nothing to clean up!"
        exit 0
    fi

    # Count files
    local file_count
    file_count=$(echo "$old_files" | wc -l | tr -d ' ')
    
    # Calculate total size
    local total_size
    total_size=$(du -sh "$LOGS_DIR" 2>/dev/null | awk '{print $1}' || echo "unknown")
    
    echo ""
    log_warning "Found $file_count old log file(s)"
    log_info "Total logs directory size: $total_size"
    echo ""

    # Show files if verbose or dry run
    if [[ "$VERBOSE" == true || "$DRY_RUN" == true ]]; then
        echo "Files to be deleted:"
        echo "─────────────────────────────────────────────────────────────"
        echo "$old_files" | while read -r file; do
            local size
            size=$(du -sh "$file" 2>/dev/null | awk '{print $1}' || echo "?")
            local mod_date
            mod_date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || echo "unknown")
            echo "  📄 $(basename "$file") ($size, modified: $mod_date)"
        done
        echo "─────────────────────────────────────────────────────────────"
        echo ""
    fi

    # Dry run exit
    if [[ "$DRY_RUN" == true ]]; then
        log_info "Dry run complete. No files were deleted."
        log_info "Run without --dry-run to actually delete files."
        exit 0
    fi

    # Confirmation prompt
    if [[ "$FORCE" != true ]]; then
        read -p "Are you sure you want to delete these $file_count file(s)? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Cleanup cancelled."
            exit 0
        fi
    fi

    # Delete files
    log_info "Deleting old log files..."
    local deleted_count=0
    
    echo "$old_files" | while read -r file; do
        if rm -f "$file" 2>/dev/null; then
            if [[ "$VERBOSE" == true ]]; then
                log_success "Deleted: $(basename "$file")"
            fi
            deleted_count=$((deleted_count + 1))
        else
            log_error "Failed to delete: $file"
        fi
    done

    echo ""
    log_success "Cleanup complete! Deleted $file_count file(s)"
    
    # Show remaining files
    local remaining
    remaining=$(find "$LOGS_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')
    local remaining_size
    remaining_size=$(du -sh "$LOGS_DIR" 2>/dev/null | awk '{print $1}' || echo "unknown")
    
    log_info "Remaining: $remaining file(s) ($remaining_size)"
    echo ""
}

main
