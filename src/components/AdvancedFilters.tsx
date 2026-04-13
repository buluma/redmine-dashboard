"use client";

import { useState, useCallback } from "react";

export interface FilterState {
  search: string;
  statusIds: number[];
  priorityIds: number[];
  assignedToMe: boolean;
  hasGithubLinks: boolean;
  hasAttachments: boolean;
  dueInDays?: number | "overdue"; // null = any, number = within N days, "overdue" = past due
  updatedAfter?: string; // ISO date
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  statuses: { id: number; name: string }[];
  priorities: { id: number; name: string }[];
  onClear: () => void;
}

export function AdvancedFilters({
  filters,
  onChange,
  statuses,
  priorities,
  onClear,
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = useCallback(<K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  }, [filters, onChange]);

  const toggleArrayItem = useCallback((
    key: "statusIds" | "priorityIds",
    id: number
  ) => {
    const current = filters[key];
    const next = current.includes(id)
      ? current.filter((i) => i !== id)
      : [...current, id];
    updateFilter(key, next);
  }, [filters, updateFilter]);

  const activeFilterCount = 
    (filters.statusIds.length > 0 ? 1 : 0) +
    (filters.priorityIds.length > 0 ? 1 : 0) +
    (filters.assignedToMe ? 0 : 0) + // doesn't count, it's a quick filter
    (filters.hasGithubLinks ? 1 : 0) +
    (filters.hasAttachments ? 1 : 0) +
    (filters.dueInDays != null ? 1 : 0) +
    (filters.updatedAfter ? 1 : 0);

  return (
    <div className="advanced-filters">
      <button
        type="button"
        className="filter-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        ⚙️ Filters
        {activeFilterCount > 0 && (
          <span className="filter-badge">{activeFilterCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="filter-panel">
          <div className="filter-row">
            <div className="filter-group">
              <label>Status</label>
              <div className="filter-chips">
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`filter-chip ${filters.statusIds.includes(s.id) ? "active" : ""}`}
                    onClick={() => toggleArrayItem("statusIds", s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>Priority</label>
              <div className="filter-chips">
                {priorities.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`filter-chip ${filters.priorityIds.includes(p.id) ? "active" : ""}`}
                    onClick={() => toggleArrayItem("priorityIds", p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Flags</label>
              <div className="filter-checkboxes">
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.hasGithubLinks}
                    onChange={(e) => updateFilter("hasGithubLinks", e.target.checked)}
                  />
                  Has GitHub Links
                </label>
                <label className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.hasAttachments}
                    onChange={(e) => updateFilter("hasAttachments", e.target.checked)}
                  />
                  Has Attachments
                </label>
              </div>
            </div>

            <div className="filter-group">
              <label>Due Date</label>
              <select
                value={filters.dueInDays ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    updateFilter("dueInDays", undefined);
                    return;
                  }
                  if (value === "overdue") {
                    updateFilter("dueInDays", "overdue");
                    return;
                  }
                  updateFilter("dueInDays", Number(value));
                }}
                className="filter-select"
              >
                <option value="">Any</option>
                <option value="7">Due within 7 days</option>
                <option value="14">Due within 14 days</option>
                <option value="30">Due within 30 days</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Updated After</label>
              <input
                type="date"
                value={filters.updatedAfter ?? ""}
                onChange={(e) => updateFilter("updatedAfter", e.target.value || undefined)}
                className="filter-input"
              />
            </div>
          </div>

          <div className="filter-actions">
            <button type="button" onClick={onClear} className="filter-clear">
              Clear All
            </button>
            <button type="button" onClick={() => setIsOpen(false)} className="filter-apply">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Apply filters to issues
export function applyFilters<T extends {
  subject: string;
  statusId: number;
  statusName: string;
  priorityId?: number | null;
  priorityName?: string | null;
  assignedToId?: number;
  githubLinks?: unknown[];
  attachments?: unknown[];
  dueDate?: string | null;
  updatedAt?: string;
}>(issues: T[], filters: FilterState): T[] {
  return issues.filter((issue) => {
    // Search
    if (filters.search) {
      const search = filters.search.toLowerCase();
      if (!issue.subject.toLowerCase().includes(search)) {
        return false;
      }
    }

    // Status filter
    if (filters.statusIds.length > 0 && !filters.statusIds.includes(issue.statusId)) {
      return false;
    }

    // Priority filter
    if (filters.priorityIds.length > 0 && (issue.priorityId == null || !filters.priorityIds.includes(issue.priorityId))) {
      return false;
    }

    // GitHub links filter
    if (filters.hasGithubLinks && issue.githubLinks?.length === 0) {
      return false;
    }

    // Attachments filter
    if (filters.hasAttachments && issue.attachments?.length === 0) {
      return false;
    }

    // Due date filter
    if (filters.dueInDays !== undefined) {
      if (!issue.dueDate) {
        return false;
      }
      const due = new Date(issue.dueDate);
      const now = new Date();
      
      if (filters.dueInDays === "overdue") {
        if (due >= now) return false;
      } else {
        const max = new Date(now);
        max.setDate(max.getDate() + filters.dueInDays);
        if (due > max) return false;
      }
    }

    // Updated after filter
    if (filters.updatedAfter && issue.updatedAt) {
      const updated = new Date(issue.updatedAt);
      const after = new Date(filters.updatedAfter);
      if (updated < after) return false;
    }

    return true;
  });
}
