"use client";

import { useState } from "react";

import { useI18n } from "@/src/components/I18nProvider";
import { useToast } from "@/src/components/ToastProvider";

export interface UseBulkIssueActionsParams {
  selectedIssueIds: number[];
  bulkStatusId: number;
  bulkPriorityId: number;
  refreshAll: () => Promise<void>;
  onClearSelection: () => void;
  onBulkPriorityApplied: () => void;
}

export interface UseBulkIssueActionsResult {
  bulkUpdating: boolean;
  updateBulkStatus: () => Promise<void>;
  updateBulkPriority: () => Promise<void>;
  updateBulkMarkDone: () => Promise<void>;
}

export function useBulkIssueActions({
  selectedIssueIds,
  bulkStatusId,
  bulkPriorityId,
  refreshAll,
  onClearSelection,
  onBulkPriorityApplied,
}: UseBulkIssueActionsParams): UseBulkIssueActionsResult {
  const { t } = useI18n();
  const toast = useToast();
  const [bulkUpdating, setBulkUpdating] = useState(false);

  async function updateBulkStatus() {
    if (selectedIssueIds.length === 0 || bulkStatusId <= 0) {
      return;
    }

    setBulkUpdating(true);

    try {
      const res = await fetch("/api/issues/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: selectedIssueIds, statusId: bulkStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk status update failed");
      }

      const failedCount = Number(data.failedCount ?? 0);
      const updatedCount = Number(data.updatedCount ?? 0);
      if (failedCount > 0) {
        toast.error(t('toasts.bulkFailedLog', { updated: updatedCount, failed: failedCount }));
        // keep a compact breadcrumb for deeper troubleshooting.
        console.error("Bulk update failures", data.failures ?? []);
      } else {
        toast.info(t('toasts.bulkSuccess', { updated: updatedCount }));
      }

      await refreshAll();
      onClearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.bulkUpdateFailed'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function runBulkUpdate(body: Record<string, unknown>, successKey: string) {
    if (selectedIssueIds.length === 0) return;
    setBulkUpdating(true);
    try {
      const res = await fetch("/api/issues/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: selectedIssueIds, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk update failed");
      }
      const failedCount = Number(data.failedCount ?? 0);
      const updatedCount = Number(data.updatedCount ?? 0);
      if (failedCount > 0) {
        toast.error(t('toasts.bulkFailedLog', { updated: updatedCount, failed: failedCount }));
      } else {
        toast.info(t(successKey, { updated: updatedCount }));
      }
      await refreshAll();
      onClearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toasts.bulkUpdateFailed'));
    } finally {
      setBulkUpdating(false);
    }
  }

  async function updateBulkPriority() {
    if (bulkPriorityId <= 0) return;
    await runBulkUpdate({ priorityId: bulkPriorityId }, 'toasts.bulkSuccess');
    onBulkPriorityApplied();
  }

  async function updateBulkMarkDone() {
    await runBulkUpdate({ doneRatio: 100 }, 'toasts.bulkSuccess');
  }

  return { bulkUpdating, updateBulkStatus, updateBulkPriority, updateBulkMarkDone };
}
