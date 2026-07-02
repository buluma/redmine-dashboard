#!/bin/bash
# Applies correlated WakaTime hours as TimeEntry rows on linked personal tickets.
# Idempotent (unique on issueId+wakaTimeDate) — safe to re-run on a trailing window.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env.sync ] && . ./.env.sync
CONVERGE="http://localhost:3001"
KEY="X-API-Key: ${CONVERGE_API_KEY:?Set CONVERGE_API_KEY in .env.sync}"
START=$(date -d "3 days ago" +%Y-%m-%d)
END=$(date +%Y-%m-%d)
curl -s -X POST "$CONVERGE/api/external/correlation" -H "$KEY" \
  -H "Content-Type: application/json" \
  -d "{\"start\": \"$START\", \"end\": \"$END\"}"
echo
