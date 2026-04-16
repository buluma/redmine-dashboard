"use client";

import React, { useState } from "react";
import { useI18n } from "./I18nProvider";

export type ColumnKey = "priority" | "due" | "progress" | "updated";

interface ColumnPickerProps {
  visibleColumns: Set<ColumnKey>;
  onChange: (columns: Set<ColumnKey>) => void;
}

export function ColumnPicker({ visibleColumns, onChange }: ColumnPickerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const columns: { key: ColumnKey; label: string }[] = [
    { key: "priority", label: t('columnPicker.columns.priority') },
    { key: "due", label: t('columnPicker.columns.due') },
    { key: "progress", label: t('columnPicker.columns.progress') },
    { key: "updated", label: t('columnPicker.columns.updated') },
  ];

  const toggleColumn = (key: ColumnKey) => {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  return (
    <div className="column-picker-container">
      <button 
        type="button" 
        className="secondary-button column-picker-trigger" 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t('columnPicker.buttonLabel')}
      >
        <span>📊</span>
        <span>{t('columnPicker.buttonLabel')}</span>
        <span className="picker-count">{t('columnPicker.count', { current: visibleColumns.size, total: columns.length })}</span>
      </button>

      {isOpen && (
        <>
          <div className="picker-overlay" onClick={() => setIsOpen(false)} />
          <div className="picker-dropdown">
            <div className="picker-header">
              <strong>{t('columnPicker.header')}</strong>
            </div>
            <div className="picker-list">
              {columns.map((col) => (
                <label key={col.key} className="picker-item">
                  <input 
                    type="checkbox" 
                    checked={visibleColumns.has(col.key)} 
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .column-picker-container {
          position: relative;
          display: inline-block;
        }

        .column-picker-trigger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.75rem;
        }

        .picker-count {
          font-size: 0.7rem;
          background: var(--line);
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          color: var(--ink-soft);
        }

        .picker-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
        }

        .picker-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          background: var(--card, #fff);
          border: 1px solid var(--line, #ddd);
          border-radius: 12px;
          box-shadow: var(--shadow);
          min-width: 180px;
          z-index: 101;
          overflow: hidden;
          animation: fade-in 0.15s ease-out;
        }

        .picker-header {
          padding: 0.75rem 1rem;
          background: var(--bg-soft);
          border-bottom: 1px solid var(--line);
          font-size: 0.85rem;
        }

        .picker-list {
          padding: 0.5rem;
          display: grid;
          gap: 0.25rem;
        }

        .picker-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          color: var(--ink);
          user-select: none;
        }

        .picker-item:hover {
          background: var(--bg-soft);
        }

        .picker-item input {
          width: auto;
          margin: 0;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}