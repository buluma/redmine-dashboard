#!/bin/bash
# Applies correlated WakaTime hours as TimeEntry rows on linked personal tickets.
# Idempotent (unique on issueId+wakaTimeDate) — safe to re-run on a trailing window.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
[ -f "$PROJECT_DIR/.env.sync" ] && . "$PROJECT_DIR/.env.sync"
CONVERGE="http://localhost:3001"
KEY="X-API-Key: ${CONVERGE_API_KEY:?Set CONVERGE_API_KEY in .env.sync}"
NTFY_URL="${NTFY_URL:-http://100.110.136.4:8091/heimdal-alerts}"
UNMATCHED_ALERT_SECONDS="${UNMATCHED_ALERT_SECONDS:-7200}"
START=$(date -d "3 days ago" +%Y-%m-%d)
END=$(date +%Y-%m-%d)
curl -s -X POST "$CONVERGE/api/external/correlation" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d "{\"start\": \"$START\", \"end\": \"$END\"}"
echo

# Alert when unmatched WakaTime activity piles up — means a project has no
# ticket link and its hours are silently untracked until someone adds one.
UNMATCHED_JSON=$(curl -s "$CONVERGE/api/external/correlation?start=$START&end=$END" -H "$KEY")
UNMATCHED_SECONDS=$(echo "$UNMATCHED_JSON" | jq '[.unmatched[]?.totalSeconds] | add // 0 | floor')
if [ "$UNMATCHED_SECONDS" -gt "$UNMATCHED_ALERT_SECONDS" ]; then
  TOP_PROJECTS=$(echo "$UNMATCHED_JSON" | jq -r '.unmatched | sort_by(-.totalSeconds) | .[:5][] | "\(.project): \((.totalSeconds / 3600 * 10 | round) / 10)h"')
  HOURS=$(( UNMATCHED_SECONDS / 3600 ))
  curl -s -X POST "$NTFY_URL" \
    -H "Title: Converge: ${HOURS}h unmatched WakaTime activity (${START}..${END})" \
    -H "Tags: warning,hourglass" \
    -d "Projects without ticket links:
$TOP_PROJECTS

Link them in Converge or they stay untracked." > /dev/null
  echo "unmatched: ${UNMATCHED_SECONDS}s — ntfy alert sent"
else
  echo "unmatched: ${UNMATCHED_SECONDS}s — under threshold"
fi
