"use client";

import { useCallback, useState } from "react";
import { enqueueSync } from "@/lib/offline-db";
import { useToast } from "@/src/components/ToastProvider";

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
    const { type, issueId, payload, onSuccess, onError, successMessage } = options;

    // Check online status
    if (typeof window !== "undefined" && !navigator.onLine) {
      try {
        await enqueueSync(issueId, type, payload);
        showToast(
          "Action queued offline. It will sync automatically when you are back online.",
          "info"
        );
        onSuccess?.();
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to enqueue offline action");
        showToast(error.message, "error");
        onError?.(error);
      }
      return;
    }

    // Process immediately if online
    setIsBusy(true);
    try {
      let url = "";
      const method = "POST";

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
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Action failed with status ${res.status}`);
      }

      if (successMessage) {
        showToast(successMessage, "success");
      }
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
