"use client";

import { useState, useEffect, useRef } from "react";

export interface FilterPreset {
  id: string;
  name: string;
  statusFilter?: string;
  priorityFilter?: string;
  search?: string;
  showFavoritesOnly?: boolean;
}

interface FilterPresetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: FilterPreset[];
  currentFilters: {
    statusFilter?: string;
    priorityFilter?: string;
    search?: string;
    showFavoritesOnly?: boolean;
  };
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onApply: (preset: FilterPreset) => void;
}

export function FilterPresetsModal({
  isOpen,
  onClose,
  presets,
  currentFilters,
  onSave,
  onDelete,
  onApply,
}: FilterPresetsModalProps) {
  const [newPresetName, setNewPresetName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && showSaveForm) {
      inputRef.current?.focus();
    }
  }, [isOpen, showSaveForm]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (newPresetName.trim()) {
      onSave(newPresetName.trim());
      setNewPresetName("");
      setShowSaveForm(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Filter Presets</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Current Filters Display */}
          <div className="current-filters">
            <h3>Current Filters</h3>
            <div className="filter-tags">
              {currentFilters.statusFilter && (
                <span className="filter-tag">Status: {currentFilters.statusFilter}</span>
              )}
              {currentFilters.priorityFilter && (
                <span className="filter-tag">Priority: {currentFilters.priorityFilter}</span>
              )}
              {currentFilters.search && (
                <span className="filter-tag">Search: {currentFilters.search}</span>
              )}
              {currentFilters.showFavoritesOnly && (
                <span className="filter-tag">Favorites Only</span>
              )}
              {!currentFilters.statusFilter && !currentFilters.priorityFilter && !currentFilters.search && !currentFilters.showFavoritesOnly && (
                <span className="filter-tag muted">No filters applied</span>
              )}
            </div>
          </div>

          {/* Save New Preset */}
          {showSaveForm ? (
            <div className="save-form">
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter preset name..."
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") setShowSaveForm(false);
                }}
              />
              <div className="save-form-actions">
                <button className="btn-primary" onClick={handleSave}>Save</button>
                <button className="btn-secondary" onClick={() => setShowSaveForm(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              className="btn-primary save-preset-btn"
              onClick={() => setShowSaveForm(true)}
            >
              + Save Current Filters
            </button>
          )}

          {/* Preset List */}
          <div className="presets-list">
            <h3>Saved Presets ({presets.length})</h3>
            {presets.length === 0 ? (
              <p className="empty-message">No saved presets yet.</p>
            ) : (
              <ul>
                {presets.map((preset) => (
                  <li key={preset.id} className="preset-item">
                    <button
                      className="preset-apply"
                      onClick={() => onApply(preset)}
                    >
                      <span className="preset-name">{preset.name}</span>
                      <span className="preset-filters">
                        {preset.statusFilter && `Status: ${preset.statusFilter}`}
                        {preset.statusFilter && preset.priorityFilter && ", "}
                        {preset.priorityFilter && `Priority: ${preset.priorityFilter}`}
                      </span>
                    </button>
                    <button
                      className="preset-delete"
                      onClick={() => onDelete(preset.id)}
                      title="Delete preset"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          
          .modal-content {
            background: var(--surface-1);
            border-radius: 12px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: var(--shadow);
          }
          
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
          }
          
          .modal-header h2 {
            margin: 0;
            font-size: 1.25rem;
          }
          
          .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--text-soft);
          }
          
          .modal-body {
            padding: 1.5rem;
            overflow-y: auto;
          }
          
          .current-filters {
            margin-bottom: 1.5rem;
          }
          
          .current-filters h3, .presets-list h3 {
            font-size: 0.875rem;
            margin: 0 0 0.75rem;
            color: var(--text-soft);
          }
          
          .filter-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          
          .filter-tag {
            background: var(--accent-light);
            color: var(--accent);
            padding: 0.25rem 0.75rem;
            border-radius: 999px;
            font-size: 0.75rem;
          }
          
          .filter-tag.muted {
            background: var(--surface-3);
            color: var(--text-soft);
          }
          
          .save-form {
            margin-bottom: 1.5rem;
          }
          
          .save-form input {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            margin-bottom: 0.75rem;
          }
          
          .save-form-actions {
            display: flex;
            gap: 0.5rem;
          }
          
          .btn-primary {
            background: var(--accent);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
          }
          
          .btn-secondary {
            background: var(--surface-3);
            color: var(--text);
            border: 1px solid var(--border);
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
          }
          
          .save-preset-btn {
            width: 100%;
            margin-bottom: 1.5rem;
          }
          
          .presets-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .preset-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem;
            border-radius: 8px;
            margin-bottom: 0.5rem;
            background: var(--surface-2);
          }
          
          .preset-apply {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            background: none;
            border: none;
            cursor: pointer;
            text-align: left;
          }
          
          .preset-name {
            font-weight: 500;
          }
          
          .preset-filters {
            font-size: 0.75rem;
            color: var(--text-soft);
          }
          
          .preset-delete {
            background: none;
            border: none;
            cursor: pointer;
            opacity: 0.6;
          }
          
          .preset-delete:hover {
            opacity: 1;
          }
          
          .empty-message {
            color: var(--text-soft);
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    </div>
  );
}