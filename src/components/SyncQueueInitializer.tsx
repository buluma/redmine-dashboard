"use client";

import { useEffect } from "react";
import { attachSyncQueueTriggers, processSyncQueue } from "@/lib/sync-queue";
import { useOfflineAccountId } from "@/src/components/OfflineAccountProvider";

export function SyncQueueInitializer() {
  const accountId = useOfflineAccountId();

  useEffect(() => {
    attachSyncQueueTriggers();
  }, []);

  useEffect(() => {
    if (accountId && navigator.onLine) void processSyncQueue();
  }, [accountId]);

  return null;
}
