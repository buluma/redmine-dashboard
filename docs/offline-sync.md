# Offline Sync Queue

Converge implements an offline-first architecture using IndexedDB and the Background Sync API. This allows users to perform actions while offline, with changes automatically synced when connectivity is restored.

## Overview

The offline sync queue enables:

- **Offline Mutations**: Create, update, delete operations while offline
- **Automatic Sync**: Background sync when connection returns
- **Queue Persistence**: IndexedDB storage survives browser restarts
- **Retry Logic**: Failed operations are retried with exponential backoff

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   UI Layer      │────▶│  enqueueSync()          │   │
│  │   (React)       │     │  mutations queued       │   │
│  └────────┬────────┘     └─────────────────────────┘   │
│           │                                             │
│           ▼                                             │
│  ┌──────────────────────────────────────────────┐      │
│  │  IndexedDB (idb library)                     │      │
│  │  Table: sync_queue                           │      │
│  │  Fields: type, payload, timestamp, retries   │      │
│  └──────────────────────────────────────────────┘      │
│           │                                             │
│           │ Check online + Register background sync     │
│           ▼                                             │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │ Service Worker  │────▶│  sync-queue handler     │   │
│  │  (sw.ts)        │     │  processes queue items  │   │
│  └────────┬────────┘     └─────────────────────────┘   │
│           │                                             │
│           │ POST /api/issues, etc.                      │
│           ▼                                             │
│  ┌──────────────────────────────────────────────┐      │
│  │  Next.js API Routes                          │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Data Model

### Sync Queue Item

```typescript
interface SyncQueueItem {
  id: string;              // Unique ID (cuid)
  type: SyncQueueType;     // Operation type
  payload: any;           // Operation data
  status: "pending" | "processing" | "completed" | "failed";
  retries: number;        // Number of retry attempts
  createdAt: string;      // ISO timestamp
  lastAttemptAt?: string; // Last retry timestamp
}

type SyncQueueType =
  | "issue_status_update"
  | "issue_comment"
  | "issue_timelog"
  | "issue_create"
  | "issue_relation"
  | "issue_attachment";
```

## Usage

### Enqueue a Sync Operation

```typescript
import { enqueueSync } from "@/lib/offline-db";
import { syncIssues } from "@/lib/sync";

// Example: Update issue status
async function updateIssueStatus(issueId: number, statusId: number) {
  // Check if online
  if (navigator.onLine) {
    // Online: Direct API call
    await syncIssues.updateStatus(issueId, statusId);
    return;
  }

  // Offline: Queue for sync
  await enqueueSync("issue_status_update", {
    issueId,
    statusId,
  });

  // Show user feedback
  toast.info("Changes saved locally. Syncing when online...");
}
```

### Service Worker Handler

The service worker (`app/sw.ts`) processes the sync queue:

```typescript
// Listen for background sync events
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-queue") {
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  const items = await getPendingSyncItems();

  for (const item of items) {
    try {
      await processSyncItem(item);
      await completeSyncItem(item.id);
    } catch (error) {
      await retrySyncItem(item.id);
    }
  }
}
```

### Processing Individual Items

```typescript
// app/api/internal/sync-queue/process/route.ts
export async function POST(request: Request) {
  const items = await getPendingSyncItems();

  for (const item of items) {
    try {
      await processSyncItem(item);
      await completeSyncItem(item.id);
    } catch (error) {
      // Retry with exponential backoff
      await incrementRetry(item.id);
    }
  }

  return Response.json({ processed: items.length });
}
```

## API Endpoints

### Queue Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/issues` | Create issue (online) or queue (offline) |
| `PATCH` | `/api/issues/[id]` | Update issue (online) or queue (offline) |
| `POST` | `/api/issues/[id]/comment` | Add comment (online) or queue (offline) |
| `POST` | `/api/issues/[id]/timelog` | Log time (online) or queue (offline) |

### Internal Sync API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/internal/sync-queue/pending` | Get pending items |
| `POST` | `/api/internal/sync-queue/process` | Process queue items |
| `DELETE` | `/api/internal/sync-queue/clear` | Clear failed items |

## Client-Side Hook

```typescript
// src/hooks/useOfflineAction.ts
export function useOfflineAction<T = void>() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const execute = async (
    onlineFn: () => Promise<T>,
    offlinePayload: any
  ): Promise<T> => {
    if (navigator.onLine) {
      return onlineFn();
    }

    await enqueueSync(offlinePayload);
    throw new Error("Offline - action queued");
  };

  return { isOffline, execute };
}
```

## Retry Logic

### Exponential Backoff

```typescript
// lib/offline-db.ts
export async function incrementRetry(itemId: string) {
  const item = await getSyncItem(itemId);
  const maxRetries = 5;
  const retryDelay = Math.min(30000 * 2 ** item.retries, 3600000); // Max 1 hour

  if (item.retries >= maxRetries) {
    await markSyncFailed(itemId);
    return;
  }

  await updateSyncItem(itemId, {
    retries: item.retries + 1,
    lastAttemptAt: new Date().toISOString(),
    status: "pending",
  });

  // Re-register background sync
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register("sync-queue");
  }
}
```

### Retry Schedule

| Attempt | Delay |
|---------|-------|
| 1st | 30 seconds |
| 2nd | 1 minute |
| 3rd | 2 minutes |
| 4th | 4 minutes |
| 5th | 8 minutes |
| 6th+ | 1 hour (max) |

## Debugging

### View Pending Sync Items

```javascript
// In browser console
const db = await idb.openDB("converge-offline", 1);
const tx = db.transaction("sync_queue", "readonly");
const store = tx.objectStore("sync_queue");
const items = await store.getAll();
console.log("Pending items:", items.filter(i => i.status === "pending"));
```

### Force Sync

```javascript
// Force background sync
if ("serviceWorker" in navigator) {
  const registration = await navigator.serviceWorker.ready;
  await registration.sync.register("sync-queue");
}
```

### Clear Failed Items

```javascript
const db = await idb.openDB("converge-offline", 1);
const tx = db.transaction("sync_queue", "readwrite");
const store = tx.objectStore("sync_queue");
await store.clear(); // Clears all items
```

## Testing

### Test Offline Mode

```javascript
// In browser console, toggle offline mode
navigator.onLine = false; // Simulate offline
navigator.onLine = true;  // Simulate online
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
5. Check Network tab for sync API calls

## Performance Considerations

1. **Batch Processing**: Process items in batches to avoid blocking UI

2. **Rate Limiting**: Respect API rate limits when flushing queue

3. **Conflict Resolution**: Last-write-wins for same-item conflicts

4. **Storage Limits**: IndexedDB has ~50% of available disk space; monitor for large queues

## Future Enhancements

- [ ] Conflict detection and resolution UI
- [ ] Manual queue management page
- [ ] Sync history/audit log
- [ ] Priority-based queue processing
- [ ]Selective sync (only certain item types)
- [ ] Queue size warnings and pruning
