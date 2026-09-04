# Offline Sync Queue

Converge implements an offline-first architecture using IndexedDB and the
Background Sync API. This allows users to perform actions while offline, with
changes automatically synced when connectivity is restored.

## Overview

The offline sync queue enables:

- **Offline Mutations**: status/assign/comment/time-log actions while offline
- **Automatic Sync**: flush triggers on reconnect and on Background Sync
- **Queue Persistence**: IndexedDB storage survives browser restarts
- **Retry Logic**: a failed item is retried on the next flush, up to a fixed
  retry cap

There is no server-side sync-queue API — the whole queue lives in the browser. A
flushed item posts directly to the same route an online client would call.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   UI Layer      │────▶│  enqueueSync()          │   │
│  │  (useOfflineAction)   │  mutation queued        │   │
│  └────────┬────────┘     └─────────────────────────┘   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────────────────────────────────┐      │
│  │  IndexedDB (idb library, db "converge-offline")│     │
│  │  Object store: syncQueue                      │      │
│  │  Fields: type, issueId, payload, createdAt,   │      │
│  │  retries                                      │      │
│  └──────────────────────────────────────────────┘      │
│           │                                             │
│           │ "online" event, or Background Sync tag       │
│           │ "sync-queue" via Service Worker              │
│           ▼                                             │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │ processSyncQueue│────▶│  processSyncItem(item)  │   │
│  │ (lib/sync-queue.ts)   │  posts directly to the  │   │
│  └─────────────────┘     │  matching API route      │   │
│                           └────────────┬────────────┘   │
│                                        │                 │
│                                        │ fetch(...)      │
│                                        ▼                 │
│  ┌──────────────────────────────────────────────┐      │
│  │  Next.js API Routes (/api/issues/..., etc.)   │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Data Model

### Sync Queue Item

`lib/offline-db.ts`:

```typescript
export interface SyncQueueItem {
  id?: number; // auto-increment key
  type: "update_status" | "assign" | "comment" | "log_time";
  issueId: string;
  payload: Record<string, unknown>;
  createdAt: string; // ISO timestamp
  retries: number;
}
```

There is no `status` field on the item itself — a pending item simply exists in
the `syncQueue` object store; a successfully flushed (or permanently failed)
item is deleted from it.

## Usage

### Enqueue a Sync Operation

```typescript
import { enqueueSync } from "@/lib/offline-db";

// enqueueSync(issueId, type, payload) — three arguments
await enqueueSync(issueId, "update_status", { statusId });
```

`useOfflineAction()` (`src/hooks/useOfflineAction.ts`) wraps this: when
`navigator.onLine` is false it calls `enqueueSync` and shows a toast; when
online it posts directly to the matching API route instead.

### Service Worker Handler

The service worker (`app/sw.ts`) listens for the Background Sync API's
`sync-queue` tag and delegates to `lib/sync-queue.ts`:

```typescript
// app/sw.ts
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-queue") {
    event.waitUntil(processSyncQueue());
  }
});
```

### Processing the Queue

```typescript
// lib/sync-queue.ts
export async function processSyncQueue(): Promise<
  { synced: number; failed: number }
> {
  const items = await getPendingSyncItems();
  // ... for each item, processSyncItem(item); on success clear it,
  // on failure increment its retry count (or drop it past MAX_RETRIES)
}
```

`processSyncItem` posts each queued item straight to its matching route:

| `type`          | Route                           |
| --------------- | ------------------------------- |
| `update_status` | `POST /api/issues/[id]/status`  |
| `assign`        | `POST /api/issues/[id]/assign`  |
| `comment`       | `POST /api/issues/[id]/comment` |
| `log_time`      | `POST /api/time-entries`        |

`attachSyncQueueTriggers()` also flushes the queue on the browser's `online`
event and once on load if already online — the Background Sync tag isn't the
only trigger.

## Client-Side Hook

```typescript
// src/hooks/useOfflineAction.ts
interface OfflineActionOptions {
  type: "update_status" | "assign" | "comment" | "log_time";
  issueId: string;
  payload: Record<string, unknown>;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  successMessage?: string;
}

export function useOfflineAction() {
  const { show: showToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const performAction = useCallback(async (options: OfflineActionOptions) => {
    const { type, issueId, payload, onSuccess, onError, successMessage } =
      options;

    // Offline: enqueue for background sync
    if (typeof window !== "undefined" && !navigator.onLine) {
      await enqueueSync(issueId, type, payload);
      showToast(
        "Action queued offline. It will sync automatically when you are back online.",
        "info",
      );
      onSuccess?.();
      return;
    }

    // Online: route to the appropriate API endpoint
    setIsBusy(true);
    try {
      let url = "";
      switch (type) {
        case "update_status":
          url = `/api/issues/${issueId}/status`;
          break;
        case "assign":
          url = `/api/issues/${issueId}/assign`;
          break;
        case "comment":
          url = `/api/issues/${issueId}/comment`;
          break;
        case "log_time":
          url = `/api/time-entries`;
          break;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Action failed with status ${res.status}`);
      if (successMessage) showToast(successMessage, "success");
      onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Action failed");
      showToast(error.message, "error");
      onError?.(error);
    } finally {
      setIsBusy(false);
    }
  }, [showToast]);

  return { performAction, isBusy };
}
```

Key points:

- `enqueueSync(issueId, type, payload)` takes three arguments (not two)
- Operations route to different API URLs based on `type`
- Returns `{ performAction, isBusy }` (not `{ isOffline, execute }`)
- Uses `useToast()` for user feedback instead of raw `toast.info()`

## Retry Logic

`lib/sync-queue.ts` retries a failed item on the _next_ flush — there is no
scheduled/exponential backoff timer. `MAX_RETRIES = 3`: once an item has failed
that many times it's dropped from the queue (counted as `failed`, not retried
again) rather than kept forever.

## Debugging

### View Pending Sync Items

```javascript
// In browser console
const db = await idb.openDB("converge-offline", 1);
const tx = db.transaction("syncQueue", "readonly");
const items = await tx.store.getAll();
console.log("Pending items:", items);
```

### Force Sync

```javascript
if ("serviceWorker" in navigator) {
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register("sync-queue");
}
```

### Clear the Queue

```javascript
const db = await idb.openDB("converge-offline", 1);
await db.clear("syncQueue");
```

## Testing

### Test Offline Mode

```javascript
// In browser console, toggle offline mode
navigator.onLine = false; // Simulate offline
navigator.onLine = true; // Simulate online
```

### Verify Queue Persistence

1. Go offline
2. Perform an action (e.g., update issue status)
3. Close browser
4. Reopen browser
5. Check IndexedDB - items should persist

### Test Background Sync

1. Register service worker
2. Go offline
3. Perform actions
4. Go online
5. Check Network tab for the direct API calls `processSyncItem` makes

## Performance Considerations

1. **Batch Processing**: `processSyncQueue` processes queued items sequentially,
   not in parallel, to avoid bursting the API

2. **Rate Limiting**: Respect API rate limits when flushing queue

3. **Conflict Resolution**: Last-write-wins for same-item conflicts

4. **Storage Limits**: IndexedDB has ~50% of available disk space; monitor for
   large queues

## Future Enhancements

- [ ] A real server-side sync-queue API (status tracking, exponential backoff)
- [ ] Conflict detection and resolution UI
- [ ] Manual queue management page
- [ ] Sync history/audit log
- [ ] Priority-based queue processing
- [ ] Selective sync (only certain item types)
- [ ] Queue size warnings and pruning
