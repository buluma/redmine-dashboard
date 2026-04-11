"use client";

import { useState, useCallback } from "react";

interface TimeEntry {
  id: string;
  hours: number;
  comments: string | null;
  activityName: string;
  spentOn: string;
  authorName: string;
}

interface TimeTrackingPanelProps {
  entries: TimeEntry[];
  onAddEntry: (hours: number, activityId: number, comments: string, spentOn: string) => void;
  activities: { id: number; name: string }[];
  isLoading: boolean;
}

export function TimeTrackingPanel({
  entries,
  onAddEntry,
  activities,
  isLoading,
}: TimeTrackingPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hours, setHours] = useState("");
  const [activityId, setActivityId] = useState<number>(activities[0]?.id ?? 0);
  const [comments, setComments] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const selectedActivityId = activityId || activities[0]?.id || 0;

  const handleSubmit = useCallback(async () => {
    const h = parseFloat(hours);
    if (h <= 0 || !selectedActivityId) return;
    
    setIsSubmitting(true);
    try {
      await onAddEntry(h, selectedActivityId, comments, spentOn);
      setHours("");
      setComments("");
    } finally {
      setIsSubmitting(false);
    }
  }, [hours, selectedActivityId, comments, spentOn, onAddEntry]);

  return (
    <div className="time-tracking-panel">
      <button
        type="button"
        className="tt-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span>⏱️ Time Tracking</span>
        <span className="tt-total">
          {totalHours.toFixed(1)}h logged
          <span className={`tt-arrow ${isExpanded ? "up" : ""}`}>▼</span>
        </span>
      </button>

      {isExpanded && (
        <div className="tt-content">
          {/* Quick Entry Form */}
          <div className="tt-form">
            <h4>Log Time</h4>
            <div className="tt-row">
              <label className="tt-field tt-hours-field">
                Hours
                <input
                  type="number"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="0.25"
                  step="0.25"
                  min="0"
                  className="tt-input"
                />
              </label>
              <label className="tt-field">
                Activity
                <select
                value={selectedActivityId}
                onChange={(e) => setActivityId(Number(e.target.value))}
                className="tt-select"
                disabled={activities.length === 0}
              >
                {activities.length === 0 && <option value={0}>No activities available</option>}
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
                </select>
              </label>
              <label className="tt-field tt-date-field">
                Date
                <input
                  type="date"
                  value={spentOn}
                  onChange={(e) => setSpentOn(e.target.value)}
                  className="tt-input tt-date"
                />
              </label>
            </div>
            <input
              type="text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What did you work on?"
              className="tt-input tt-comments"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !hours || parseFloat(hours) <= 0 || selectedActivityId <= 0}
              className="tt-submit"
            >
              {isSubmitting ? "Saving..." : "Log Time"}
            </button>
          </div>

          {/* Recent Entries */}
          <div className="tt-entries">
            <h4>Recent Entries</h4>
            {isLoading ? (
              <p className="muted">Loading...</p>
            ) : entries.length === 0 ? (
              <p className="muted">No time entries yet</p>
            ) : (
              <table className="tt-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Hours</th>
                    <th>Activity</th>
                    <th>Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 10).map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.spentOn).toLocaleDateString()}</td>
                      <td className="tt-hours">{entry.hours.toFixed(1)}h</td>
                      <td>{entry.activityName}</td>
                      <td className="tt-comment">{entry.comments || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
