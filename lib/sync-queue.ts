import {
  getPendingSyncItems,
  clearSyncItems,
  incrementSyncRetries,
  type SyncQueueItem,
} from "@/lib/offline-db";

const MAX_RETRIES = 3;

// "Development" — same default used for the quick-log form
// (app/issues/[id]/page.tsx) and the local-issue timelog route.
const DEFAULT_LOG_TIME_ACTIVITY_ID = 31;

async function processSyncItem(item: SyncQueueItem): Promise<boolean> {
  try {
    switch (item.type) {
      case "update_status": {
        const res = await fetch(`/api/issues/${item.issueId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) throw new Error(`Status update failed: ${res.status}`);
        return true;
      }

      case "assign": {
        const res = await fetch(`/api/issues/${item.issueId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) throw new Error(`Assign failed: ${res.status}`);
        return true;
      }

      case "comment": {
        const res = await fetch(`/api/issues/${item.issueId}/comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) throw new Error(`Comment failed: ${res.status}`);
        return true;
      }

      case "log_time": {
        // Normalize items enqueued by a pre-fix build of the app: they were
        // written for /api/time-entries' shape ({hours, comments}, often
        // without activityId at all) and would otherwise fail
        // timeLogSchema validation against the real route below. Leaves
        // already-correct payloads (comment, activityId present) untouched.
        const payload = item.payload as Record<string, unknown>;
        const normalizedPayload: Record<string, unknown> = {
          ...payload,
          comment: payload.comment ?? payload.comments,
          activityId: payload.activityId ?? DEFAULT_LOG_TIME_ACTIVITY_ID,
        };
        delete normalizedPayload.comments;

        const res = await fetch(`/api/issues/${item.issueId}/timelog`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizedPayload),
        });
        if (!res.ok) throw new Error(`Time log failed: ${res.status}`);
        return true;
      }

      default:
        console.warn(`[SyncQueue] Unknown type: ${item.type}`);
        return true; // Remove unknown types
    }
  } catch (error) {
    console.error(`[SyncQueue] Item ${item.id} failed:`, error);
    return false;
  }
}

export async function processSyncQueue(): Promise<{
  synced: number;
  failed: number;
}> {
  const items = await getPendingSyncItems();
  if (items.length === 0) return { synced: 0, failed: 0 };

  console.log(`[SyncQueue] Processing ${items.length} pending items...`);

  let synced = 0;
  let failed = 0;
  const successIds: number[] = [];

  for (const item of items) {
    const id = item.id ?? 0;
    const ok = await processSyncItem(item);

    if (ok) {
      synced++;
      successIds.push(id);
    } else {
      if ((item.retries ?? 0) >= MAX_RETRIES) {
        console.error(
          `[SyncQueue] Item ${id} exceeded max retries (${MAX_RETRIES})`,
        );
        failed++;
        successIds.push(id); // Remove permanently failed items
      } else {
        await incrementSyncRetries(id);
      }
    }
  }

  if (successIds.length > 0) {
    await clearSyncItems(successIds);
  }

  console.log(`[SyncQueue] Done: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

export function attachSyncQueueTriggers(): void {
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      console.log("[SyncQueue] Online detected, processing queue...");
      void processSyncQueue();
    });

    if (navigator.onLine) {
      void processSyncQueue();
    }
  }
}
