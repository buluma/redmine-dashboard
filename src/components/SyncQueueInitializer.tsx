"use client";

import { useEffect } from "react";
import { attachSyncQueueTriggers } from "@/lib/sync-queue";

export function SyncQueueInitializer() {
  useEffect(() => {
    attachSyncQueueTriggers();
  }, []);

  return null;
}
