# TODO

## In Progress

- [ ] wakatime api integration for worktime tracking - https://wakatime.com/developers/#authentication

## Pending

- [ ] wrap ollama around tailscale aperture
- [ ] ai tool calls
- [ ] swagger api - add mbu_logs, traces and server_side_logs from prisma db (actually all tables in prisma would be great)

## Done

| Feature | Status | Notes | Date |
|---------|--------|-------|------|
| swagger api documentation | ✅ DONE | Added /heimdall/data and /heimdall/refresh to Swagger UI | 2026-04-13 |
| integrate to streamline REST API + logs | ✅ DONE | Prisma models + import script complete | 2026-04-13 |
| slack integration - read group messages | ✅ DONE | Slack page with multi-channel monitoring, auto-refresh, and message display | 2026-04-13 |
| slack integration - send Redmine updates to channel | ✅ DONE | SlackNotifier service integrated into sync workflow | 2026-04-13 |
| slack integration - webhook for external notifications | ✅ DONE | POST /api/slack/notify endpoint | 2026-04-13 |
| swagger api documentation | ✅ DONE | Swagger UI at /api-docs with full API reference | 2026-04-13 |
| heimdall auto-refresh | ✅ DONE | Auto-refresh every 5 minutes with toggle | 2026-04-13 |
