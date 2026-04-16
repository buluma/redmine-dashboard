"use client";

import { useState, useCallback } from "react";
import { useI18n } from "./I18nProvider";

interface BulkAction {
  label: string;
  value: string;
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onAction: (action: string) => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, actions, onAction, onClear }: BulkActionBarProps) {
  const [selectedAction, setSelectedAction] = useState("");
  const { t } = useI18n();

  const handleApply = useCallback(() => {
    if (selectedAction) {
      onAction(selectedAction);
      setSelectedAction("");
    }
  }, [selectedAction, onAction]);

  if (selectedCount === 0) return null;

  return (
    <div className="bulk-action-bar">
      <span className="bulk-count">{t("bulkActions.selectedCount", { count: selectedCount })}</span>
      
      <select
        value={selectedAction}
        onChange={(e) => setSelectedAction(e.target.value)}
        className="bulk-select"
      >
        <option value="">{t("bulkActions.selectAction")}</option>
        {actions.map((action) => (
          <option key={action.value} value={action.value}>
            {action.label}
          </option>
        ))}
      </select>
      
      <button
        type="button"
        className="bulk-apply"
        onClick={handleApply}
        disabled={!selectedAction}
      >
        {t("bulkActions.applyBtn")}
      </button>
      
      <button
        type="button"
        className="bulk-clear"
        onClick={onClear}
      >
        {t("bulkActions.clearBtn")}
      </button>
    </div>
  );
}

// Hook for managing bulk selection
export function useBulkSelection<T extends { id: string | number }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  const toggle = useCallback((id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string | number) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggle,
    selectAll,
    clearSelection,
    isSelected,
  };
}