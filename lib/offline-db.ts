import { openDB, type IDBPDatabase } from "idb";

// ─── Types ───────────────────────────────────────────────────────────────

export interface CachedIssue {
  id: string;
  redmineIssueId: number | null;
  redmineBaseUrl: string | null;
  source: string;
  localIssueNumber: number | null;
  userId: string;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  statusId: number;
  statusName: string;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  assignedToName: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  lastActivityAt: string | null;
  cachedAt: string;
}

export interface SyncQueueItem {
  id?: number; // auto-increment
  type: "update_status" | "assign" | "comment" | "log_time";
  issueId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const DB_NAME = "converge-offline";
const DB_VERSION = 1;
const MAX_CACHED_ISSUES = 500;

// ─── Database ────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("issues")) {
          const store = db.createObjectStore("issues", { keyPath: "id" });
          store.createIndex("userId", "userId");
          store.createIndex("statusName", "statusName");
          store.createIndex("lastActivityAt", "lastActivityAt");
          store.createIndex("cachedAt", "cachedAt");
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          const store = db.createObjectStore("syncQueue", {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("issueId", "issueId");
          store.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

// ─── Issue Cache ─────────────────────────────────────────────────────────

export async function cacheIssues(issues: CachedIssue[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("issues", "readwrite");

  // Enforce max cache size: delete oldest if exceeding limit
  const count = await tx.store.count();
  if (count + issues.length > MAX_CACHED_ISSUES) {
    const index = tx.store.index("cachedAt");
    const toDelete = count + issues.length - MAX_CACHED_ISSUES;
    const cursor = await index.openCursor();
    let deleted = 0;
    let c = cursor;
    while (c && deleted < toDelete) {
      await c.delete();
      deleted++;
      c = await c.continue();
    }
  }

  for (const issue of issues) {
    await tx.store.put({ ...issue, cachedAt: new Date().toISOString() });
  }
  await tx.done;
}

export async function cacheIssue(issue: CachedIssue): Promise<void> {
  const db = await getDB();
  await db.put("issues", { ...issue, cachedAt: new Date().toISOString() });
}

export async function getCachedIssues(
  userId: string,
  limit = 100,
): Promise<CachedIssue[]> {
  const db = await getDB();
  const index = db.transaction("issues").store.index("userId");
  return index.getAll(IDBKeyRange.only(userId), limit);
}

export async function getCachedIssue(id: string): Promise<CachedIssue | undefined> {
  const db = await getDB();
  return db.get("issues", id);
}

export async function clearAllCachedIssues(): Promise<void> {
  const db = await getDB();
  await db.clear("issues");
}

// ─── Sync Queue ──────────────────────────────────────────────────────────

export async function enqueueSync(
  issueId: string,
  type: SyncQueueItem["type"],
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDB();
  await db.add("syncQueue", {
    type,
    issueId,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  });

  // Try to trigger background sync if supported
  if (typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window) {
    try {
      // Background Sync API isn't in standard DOM lib types yet.
      const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & {
        sync: { register(tag: string): Promise<void> };
      };
      await registration.sync.register("sync-queue");
    } catch (err) {
      console.warn("[OfflineDB] Background sync registration failed:", err);
    }
  }
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll("syncQueue");
}

export async function clearSyncItems(ids: number[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("syncQueue", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function incrementSyncRetries(id: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("syncQueue", "readwrite");
  const item = await tx.store.get(id);
  if (item) {
    item.retries = (item.retries ?? 0) + 1;
    await tx.store.put(item);
  }
  await tx.done;
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear("syncQueue");
}
