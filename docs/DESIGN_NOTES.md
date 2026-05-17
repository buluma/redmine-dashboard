# Design notes — deferred items

Working notes for items the backlog marked "design needed". Each
section captures: the user-visible problem, the contract that has to
land first, and the slices that can be merged independently. Update
these before opening implementation PRs.

---

## 1.12 Offline conflict resolution UI

### Problem

The PWA + Compose client both queue mutations while offline
(`src/hooks/useOfflineAction.ts` → IndexedDB; `OfflineSyncWorker.kt` →
Room). When the queue drains after reconnect, **none** of the mutation
endpoints look at the row's current `updatedAt` against the queued
state, so a write made by another user in the meantime is silently
overwritten. Users get a green toast on a destructive overwrite.

### Server contract

Add an optional `expectedUpdatedAt: string` (ISO-8601) to every
write-side request on:

- `POST /api/issues/[id]/status`
- `POST /api/issues/[id]/comment`
- `POST /api/issues/[id]/timelog`
- `POST /api/issues/[id]/assign`
- `POST /api/issues/bulk-status`, `POST /api/issues/bulk-update`
- mobile equivalents under `/api/mobile/v1/*`

When `expectedUpdatedAt` is present and does not match the current row,
return:

```json
HTTP/1.1 409 Conflict
{
  "error": "stale_write",
  "expectedUpdatedAt": "2026-05-12T08:33:11Z",
  "actualUpdatedAt": "2026-05-15T14:02:04Z",
  "serverState": { "statusId": 5, "statusName": "Closed", ... }
}
```

If `expectedUpdatedAt` is absent, behave exactly as today
(last-writer-wins). Mobile/web are free to roll out incrementally.

Telemetry: emit `issue.write.stale_write` with `entityId`,
`userId`, `field` so dashboards can show how often this happens before
the UI is finished.

### Client storage (PWA)

Add a sibling IndexedDB store next to `syncQueue`:

```ts
interface OfflineConflict {
  id: number;
  conflictKey: string;          // `${type}:${issueId}`
  type: "update_status" | "comment" | "log_time" | "assign";
  issueId: string;
  payload: Record<string, unknown>;
  serverState: Record<string, unknown>;
  expectedUpdatedAt: string;
  actualUpdatedAt: string;
  createdAt: string;
  dismissed: boolean;
}
```

`processSyncItem` (lib/sync-queue.ts) — on 409, parse the body, push
the OfflineConflict, then **drop the queue entry**. Do not retry.

### Client storage (Android)

Mirror via a Room entity `OfflineConflictEntity` + DAO; `OfflineSyncWorker.dispatch`
takes the same branch. Same JSON shape so a shared resolver UI is
viable later if we ever build a web/native shared web view.

### UX

A dedicated banner under the dashboard hero when
`offlineConflicts.length > 0`:

```
⚠ 2 changes couldn't sync — review conflicts
```

Click → opens `<ConflictResolver>` modal. Per conflict row:

- **Header:** "Status update for ABC-42 — your change vs current"
- **Side-by-side diff** of `payload` vs `serverState`.
- Three buttons: **Keep mine** (retries the write with the new
  `expectedUpdatedAt`), **Keep theirs** (drops the queued entry,
  marks dismissed), **Open issue** (deep-links to detail with a
  toast nudge to merge manually).

Top-level **Discard all** for the inevitable Friday-afternoon
cleanup.

### Sequencing

1. Server contract on a single endpoint (`POST /api/issues/[id]/status`).
2. Client conflict store + drop-on-409 in `processSyncItem`.
3. `<OfflineConflictsBanner>` + `<ConflictResolver>` modal.
4. Roll the contract out to the other endpoints.
5. Mirror in Android (1.17g).

Tests: unit on the parse-and-store path; e2e under
`e2e/offline-conflict.spec.ts` that flips `navigator.onLine`, queues a
status update, returns 409, asserts banner + modal text + retry.

---

## 1.14 Push notification preferences

### Problem

`sendPushNotification` in `src/lib/push.ts` blasts every assigned-issue
update to every subscribed device. Users with high-traffic Redmine
projects are getting paged for status churn they don't care about.

### Data model

New Prisma model:

```prisma
model NotificationPreference {
  id        String   @id @default(cuid())
  userId    String   @unique
  channels  Json     // { "issue.assigned": { push: true, slack: false }, ... }
  mutedProjectIds  String[]    @default([])
  mutedIssueIds    Int[]       @default([])
  quietHoursStart  String?     // "22:00"
  quietHoursEnd    String?     // "07:00"
  timezone         String?     // IANA, e.g. "Africa/Johannesburg"
  updatedAt        DateTime    @updatedAt
  createdAt        DateTime    @default(now())
  user             User        @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`channels` is a free-form JSON map so adding `slack` / `email`
transports later doesn't need a schema change. Initial seed:

```json
{
  "issue.assigned":          { "push": true  },
  "issue.status_changed":    { "push": true  },
  "issue.priority_changed":  { "push": true  },
  "issue.commented_on_mine": { "push": true  },
  "issue.due_soon":          { "push": false },
  "issue.bulk_update":       { "push": false }
}
```

### Server enforcement

`sendPushNotification(userId, eventType, payload)` — before posting to
Web Push / FCM, load `NotificationPreference` for `userId` and apply:

1. `eventType` lookup in `channels` → required `push: true`.
2. `payload.projectId` not in `mutedProjectIds`.
3. `payload.issueId` not in `mutedIssueIds`.
4. Current time in `userId`'s timezone not in `[quietHoursStart, quietHoursEnd)`.
   Always allow `urgency === "critical"` overrides.

`sync.ts` `emitEvent` calls already produce diffs for status/priority
changes — pass them through.

### UI

New route `/ops/preferences` (any role). Server-rendered defaults +
client form. Three sections:

- **Event types:** toggle table (event x channel).
- **Mute list:** add-by-search (autocomplete on projects/issues),
  shown as removable chips.
- **Quiet hours:** start/end time pickers + timezone select
  (default `Intl.DateTimeFormat().resolvedOptions().timeZone`).

Plus an "Apply test notification" button that fires a synthetic
`issue.assigned` to validate channel + quiet-hours behaviour.

### Sequencing

1. Prisma model + migration; `getOrCreatePreferences(userId)` helper.
2. Gate `sendPushNotification` on the preference check.
3. UI page + form.
4. Telemetry: `push.gate.skipped` with the reason
   (`muted_project` / `muted_issue` / `quiet_hours` / `channel_off`).

### Open questions

- Should mute-by-issue cascade to its children? Probably yes for
  parent-tracking issues. Leave a flag `cascadeToChildren` defaulting
  to true.
- Per-device opt-out vs per-user? Start per-user; per-device adds
  complexity. The same Compose app can register multiple FCM tokens
  for one user — they'll all share the preference.

---

## 1.15 Webhook retry config + replay

### Problem

`src/lib/webhook-subscription.ts` `dispatchWebhook` posts once. On
network blip or a downstream 5xx, the event is lost. The deliveries
view shows the failure but offers no way to re-fire.

### Data model

Add to `WebhookSubscription`:

```prisma
model WebhookSubscription {
  // existing fields...
  retryStrategy    String   @default("exponential")  // "none" | "linear" | "exponential"
  maxAttempts      Int      @default(5)
  backoffSeconds   Int      @default(30)             // base; doubles per attempt for exponential
  timeoutMs        Int      @default(10_000)
}
```

Add to `WebhookDelivery`:

```prisma
model WebhookDelivery {
  // existing fields...
  attempt          Int      @default(1)
  nextRetryAt      DateTime?
  retryOfDeliveryId String? // self-FK so we can chain a replay back to the original failure
}
```

### Server enforcement

`dispatchWebhook` after a non-2xx response:

1. `attempt < maxAttempts` and `retryStrategy !== "none"`.
2. Compute next delay: `linear = backoffSeconds * attempt`,
   `exponential = backoffSeconds * 2^(attempt - 1)`, capped at
   `MAX_BACKOFF_MS=15min`.
3. Persist a new `WebhookDelivery` with `nextRetryAt`, `attempt + 1`.

A retry worker (extend `src/lib/streamline-log-poller.ts` pattern):
every 30 s, scan `WebhookDelivery where nextRetryAt <= now() AND
status = "scheduled"` and re-fire. Same leader-lock as other
in-process pollers.

Telemetry: `webhook.delivery.retry.attempted`, `*.succeeded`,
`*.exhausted` with `subscriptionId` and `attempt` tags.

### Replay endpoint

```
POST /api/webhooks/deliveries/[id]/retry
```

Admin/Editor. Creates a new `WebhookDelivery` row with
`retryOfDeliveryId = [id]`, `attempt = 1`, immediate dispatch. Returns
the new delivery row.

### UI

`app/webhooks/deliveries/page.tsx`:

- New "Replay" button on each failed delivery row.
- Row expansion shows the attempt chain (parent → retries).
- Subscription page exposes `retryStrategy` / `maxAttempts` /
  `backoffSeconds` / `timeoutMs` as form fields, with sane defaults.

### Sequencing

1. Schema migration (`prisma migrate dev --name webhook_retry`).
2. Dispatcher: schedule retries instead of bailing.
3. Retry worker (poller) + leader lock.
4. Replay endpoint.
5. UI: subscription form + delivery replay button + attempt chain.
6. Tests: unit for backoff math; integration that asserts a failing
   subscription is retried `maxAttempts` times then marked exhausted.

### Open questions

- Should we retry 4xx? No — 4xx is a client bug in the subscriber.
  Retry on `502 | 503 | 504 | 408 | 429 | network_error`.
- Idempotency: subscribers should already de-dup by
  `X-Converge-Delivery-Id`. Document this in `app/api-docs` and surface
  the header on every retry attempt.
- Replay-of-replay: cap chain depth at 10 to avoid runaway loops.

---

## Cross-cutting

All three items emit new telemetry events. Add them to
`src/lib/telemetry.ts` callsite docs and the Prometheus exporter
allow-list at the same time so ops dashboards pick them up without an
ad-hoc change.

Where these features touch the mobile client, ensure 1.17g (offline
conflict mirroring) and the future push-prefs surface on Settings get
booked as follow-ups before merging the web side.
