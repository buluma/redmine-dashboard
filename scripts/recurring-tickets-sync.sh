#!/bin/bash
# Runs one recurring-ticket tick: creates any due series tickets, closes any
# due instances, pushing WakaTime hours to real Redmine along the way.
# Idempotent — safe to re-run; a period that already has an instance is
# skipped, and a closed instance is never reopened.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
[ -f "$PROJECT_DIR/.env.sync" ] && . "$PROJECT_DIR/.env.sync"
CONVERGE="http://localhost:3001"
KEY="X-API-Key: ${CONVERGE_API_KEY:?Set CONVERGE_API_KEY in .env.sync}"
NTFY_URL="${NTFY_URL:-http://100.110.136.4:8091/heimdal-alerts}"
CLOSE_ATTEMPTS_ALERT_THRESHOLD="${RECURRING_TICKETS_CLOSE_ATTEMPTS_ALERT_THRESHOLD:-2}"

RESULT=$(curl -s -X POST "$CONVERGE/api/external/recurring-tickets" -H "$KEY")
echo "$RESULT"

LOCKED=$(echo "$RESULT" | jq -r '.locked // false')
if [ "$LOCKED" = "true" ]; then
  echo "recurring-tickets: another tick already running, skipped"
  exit 0
fi

CREATE_FAILURES=$(echo "$RESULT" | jq -c '.createFailures // []')
CREATE_FAILURE_COUNT=$(echo "$CREATE_FAILURES" | jq 'length')
if [ "$CREATE_FAILURE_COUNT" -gt 0 ]; then
  DETAIL=$(echo "$CREATE_FAILURES" | jq -r '.[] | "\(.seriesKey) (\(.periodKey)): \(.error)"')
  curl -s -X POST "$NTFY_URL" \
    -H "Title: Converge: recurring ticket creation failed" \
    -H "Tags: warning,rotating_light" \
    -d "$DETAIL" > /dev/null
  echo "recurring-tickets: $CREATE_FAILURE_COUNT create failure(s) — ntfy alert sent"
fi

CLOSE_FAILURES=$(echo "$RESULT" | jq -c '.closeFailures // []')
CLOSE_FAILURE_COUNT=$(echo "$CLOSE_FAILURES" | jq 'length')
if [ "$CLOSE_FAILURE_COUNT" -gt 0 ]; then
  DETAIL=$(echo "$CLOSE_FAILURES" | jq -r '.[] | "\(.instanceId): \(.error)"')
  curl -s -X POST "$NTFY_URL" \
    -H "Title: Converge: recurring ticket close failed" \
    -H "Tags: warning,rotating_light" \
    -d "$DETAIL" > /dev/null
  echo "recurring-tickets: $CLOSE_FAILURE_COUNT close failure(s) — ntfy alert sent"
fi

STUCK=$(echo "$RESULT" | jq -c "[.closed[]? | select(.closeAttempts >= $CLOSE_ATTEMPTS_ALERT_THRESHOLD and .status == \"resolved_not_closed\")]")
STUCK_COUNT=$(echo "$STUCK" | jq 'length')
if [ "$STUCK_COUNT" -gt 0 ]; then
  DETAIL=$(echo "$STUCK" | jq -r '.[] | "\(.seriesKey) (\(.instanceId)): \(.closeAttempts) attempts, still not Closed in Redmine"')
  curl -s -X POST "$NTFY_URL" \
    -H "Title: Converge: recurring ticket stuck as Resolved, not Closed" \
    -H "Tags: warning" \
    -d "$DETAIL" > /dev/null
  echo "recurring-tickets: $STUCK_COUNT stuck resolved-not-closed — ntfy alert sent"
fi

ZERO_HOURS=$(echo "$RESULT" | jq -c '[.closed[]? | select(.expectsTime == true and ((.hoursApplied // 0) == 0))]')
ZERO_HOURS_COUNT=$(echo "$ZERO_HOURS" | jq 'length')
if [ "$ZERO_HOURS_COUNT" -gt 0 ]; then
  DETAIL=$(echo "$ZERO_HOURS" | jq -r '.[] | "\(.seriesKey) (\(.instanceId)): closed with 0 hours logged"')
  curl -s -X POST "$NTFY_URL" \
    -H "Title: Converge: recurring ticket closed with zero hours" \
    -H "Tags: warning,hourglass" \
    -d "$DETAIL" > /dev/null
  echo "recurring-tickets: $ZERO_HOURS_COUNT zero-hour close(s) on a time-expecting series — ntfy alert sent"
fi

if [ "$CREATE_FAILURE_COUNT" -eq 0 ] && [ "$CLOSE_FAILURE_COUNT" -eq 0 ] && [ "$STUCK_COUNT" -eq 0 ] && [ "$ZERO_HOURS_COUNT" -eq 0 ]; then
  echo "recurring-tickets: clean run, no alerts"
fi
