#!/bin/bash
# ============================================================================
# Streamline API Model Tracer
# Description: Fetches and traces models via the Streamline REST API
# Usage: ./scripts/trace-models.sh [options]
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEBUG_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$DEBUG_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default values
ENVIRONMENT="${STREAMLINE_ENV:-staging}"
API_TOKEN="${REST_API_TOKEN:-}"
LOG_COUNT=10
MODEL_ALIAS=""
LOG_LEVEL=""
TRACE_TYPE=""
OUTPUT_FORMAT="json"

# API endpoints
get_api_url() {
    local env="$1"
    case "$env" in
        staging)
            echo "https://streamline.staging.vodacomsa-battery.nasctech.com/api/v1/custom_objects"
            ;;
        production)
            echo "https://streamline.vodacomsa-battery.nasctech.com/api/v1/custom_objects"
            ;;
        *)
            log_error "Unknown environment: $env"
            log_info "Valid environments: staging, production"
            exit 1
            ;;
    esac
}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Functions
# ============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Fetch and trace models via Streamline REST API

Options:
  -e, --environment ENV     Environment (staging|production) [default: staging]
  -t, --token TOKEN         REST API token (or set REST_API_TOKEN env var)
  -m, --model MODEL         Model alias to trace (e.g., mbu_logs, projects)
  -n, --count COUNT         Number of records to fetch [default: 10]
  -l, --log-level LEVEL     Filter by log level (ERROR|DEBUG|INFO)
  -T, --trace-type TYPE     Filter by trace type (exception|log)
  -f, --format FORMAT       Output format (json|table) [default: json]
  -a, --all-models          Trace all known models
  -h, --help                Show this help message

Examples:
  # Fetch last 10 MBU logs
  $(basename "$0") -m mbu_logs

  # Fetch ERROR logs
  $(basename "$0") -m mbu_logs -l ERROR

  # Trace all models
  $(basename "$0") -a

  # Fetch exception logs from production
  $(basename "$0") -m mbu_logs -T exception -e production

Environment Variables:
  REST_API_TOKEN    Your Streamline REST API token
  STREAMLINE_ENV    Default environment (staging|production)

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

validate_token() {
    if [[ -z "$API_TOKEN" ]]; then
        log_error "API token is not set!"
        log_info "Set REST_API_TOKEN environment variable or use --token option"
        exit 1
    fi
}

get_base_url() {
    local env="$1"
    get_api_url "$env"
}

fetch_logs() {
    local model="$1"
    local url="$2"
    local params="token=${API_TOKEN}&model_alias=${model}&order_by=id&order=DESC&limit=${LOG_COUNT}"
    
    # Add optional filters
    if [[ -n "$LOG_LEVEL" ]]; then
        params="${params}&log_level=${LOG_LEVEL}"
    fi
    
    if [[ -n "$TRACE_TYPE" ]]; then
        params="${params}&trace_type=${TRACE_TYPE}"
    fi
    
    local full_url="${url}/rest_test/get_all?${params}"
    
    log_info "Fetching from: ${model}"
    log_info "URL: ${full_url}"
    
    # Make API request
    local response
    response=$(curl -s -w "\n%{http_code}" "$full_url")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    if [[ "$http_code" -eq 200 ]]; then
        local output_file="${LOGS_DIR}/${model}_${TIMESTAMP}.json"
        echo "$body" | jq '.' > "$output_file" 2>/dev/null || echo "$body" > "$output_file"
        
        log_success "Response saved to: ${output_file}"
        
        # Display summary
        if command -v jq &> /dev/null; then
            local count=$(echo "$body" | jq -r '.data.count // 0')
            log_info "Records retrieved: ${count}"
            
            if [[ "$OUTPUT_FORMAT" == "table" ]]; then
                display_table "$body"
            fi
        fi
    else
        log_error "HTTP ${http_code}: Request failed"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

display_table() {
    local json="$1"
    echo ""
    echo "┌──────────┬──────────────┬──────────┬──────────────────────────┬─────────────────────────────────┐"
    echo "│ ID       │ Trace Type   │ Level    │ Created At               │ Backtrace                       │"
    echo "├──────────┼──────────────┼──────────┼──────────────────────────┼─────────────────────────────────┤"
    
    echo "$json" | jq -r '.data.records[] | fromjson | [.id, .trace_type, .log_level, .created_at, (.backtrace | tostring | .[0:30])] | @tsv' | \
    while IFS=$'\t' read -r id trace_type log_level created_at backtrace; do
        printf "│ %-8s │ %-12s │ %-8s │ %-24s │ %-31s │\n" \
            "${id:-N/A}" "${trace_type:-N/A}" "${log_level:-N/A}" "${created_at:-N/A}" "${backtrace:-N/A}"
    done
    
    echo "└──────────┴──────────────┴──────────┴──────────────────────────┴─────────────────────────────────┘"
    echo ""
}

count_models() {
    local url="$1"
    
    log_info "Fetching record counts for all models..."
    echo ""
    
    local models=("mbu_logs" "server_side_rules_log" "traces")
    
    echo "┌─────────────────────────────┬───────────────┐"
    echo "│ Model                       │ Record Count  │"
    echo "├─────────────────────────────┼───────────────┤"
    
    for model in "${models[@]}"; do
        local count_url="${url}/rest_test/count?token=${API_TOKEN}&model_alias=${model}"
        local response=$(curl -s "$count_url")
        local count=$(echo "$response" | jq -r '.data.count // 0' 2>/dev/null || echo "0")
        printf "│ %-27s │ %-13s │\n" "$model" "$count"
    done
    
    echo "└─────────────────────────────┴───────────────┘"
    echo ""
}

# ============================================================================
# Parse command line arguments
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -t|--token)
            API_TOKEN="$2"
            shift 2
            ;;
        -m|--model)
            MODEL_ALIAS="$2"
            shift 2
            ;;
        -n|--count)
            LOG_COUNT="$2"
            shift 2
            ;;
        -l|--log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        -T|--trace-type)
            TRACE_TYPE="$2"
            shift 2
            ;;
        -f|--format)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        -a|--all-models)
            ALL_MODELS=true
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
    echo "  Streamline API Model Tracer"
    echo "============================================"
    echo ""
    
    # Validate inputs
    validate_token
    
    # Create logs directory
    mkdir -p "$LOGS_DIR"
    
    # Get base URL
    BASE_URL=$(get_base_url "$ENVIRONMENT")
    
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Base URL: ${BASE_URL}"
    log_info "Log Count: ${LOG_COUNT}"
    [[ -n "$LOG_LEVEL" ]] && log_info "Log Level Filter: ${LOG_LEVEL}"
    [[ -n "$TRACE_TYPE" ]] && log_info "Trace Type Filter: ${TRACE_TYPE}"
    echo ""
    
    # Count all models if requested
    if [[ "$ALL_MODELS" == true ]]; then
        count_models "$BASE_URL"
        
        # Fetch logs for all models
        local models=("mbu_logs" "server_side_rules_log" "traces")
        for model in "${models[@]}"; do
            fetch_logs "$model" "$BASE_URL"
            echo ""
        done
    elif [[ -n "$MODEL_ALIAS" ]]; then
        # Fetch specific model
        fetch_logs "$MODEL_ALIAS" "$BASE_URL"
    else
        log_warning "No model specified. Use -m <model> or -a for all models"
        echo ""
        usage
    fi
    
    log_success "Debug session complete!"
    log_info "Logs saved to: ${LOGS_DIR}"
    echo ""
}

main
