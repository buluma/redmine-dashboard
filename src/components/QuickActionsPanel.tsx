"use client";

import { useState, useCallback } from "react";

interface QuickActionsPanelProps {
  issueId: number;
  currentStatus: string;
  currentAssignee?: string;
  onStatusChange: (statusId: number) => void;
  onAssign: (userId: number) => void;
  onAddTime: (hours: number, comment: string) => void;
  statuses: { id: number; name: string }[];
  users: { id: number; name: string }[];
}

export function QuickActionsPanel({
  issueId,
  currentStatus,
  currentAssignee,
  onStatusChange,
  onAssign,
  onAddTime,
  statuses,
  users,
}: QuickActionsPanelProps) {
  const [activeTab, setActiveTab] = useState<"status" | "assign" | "time">("status");
  const [selectedStatus, setSelectedStatus] = useState<number>(0);
  const [selectedUser, setSelectedUser] = useState<number>(0);
  const [userSearch, setUserSearch] = useState("");
  const [hours, setHours] = useState("");
  const [comment, setComment] = useState("");
  const selectedStatusIsAllowed = selectedStatus > 0 && statuses.some((status) => status.id === selectedStatus);

  const filteredUsers = userSearch
    ? users.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()))
    : users;

  const handleTimeSubmit = useCallback(() => {
    const h = parseFloat(hours);
    if (h > 0) {
      onAddTime(h, comment);
      setHours("");
      setComment("");
    }
  }, [hours, comment, onAddTime]);

  return (
    <div className="quick-actions-panel">
      <div className="qa-header">
        <span className="qa-title">Quick Actions</span>
        <span className="qa-issue">#{issueId}</span>
      </div>

      <div className="qa-tabs">
        <button
          className={activeTab === "status" ? "active" : ""}
          onClick={() => setActiveTab("status")}
        >
          Status
        </button>
        <button
          className={activeTab === "assign" ? "active" : ""}
          onClick={() => setActiveTab("assign")}
        >
          Assign
        </button>
        <button
          className={activeTab === "time" ? "active" : ""}
          onClick={() => setActiveTab("time")}
        >
          Time
        </button>
      </div>

      <div className="qa-content">
        {activeTab === "status" && (
          <div className="qa-section">
            <label className="qa-label">
              Current: <strong>{currentStatus}</strong>
            </label>
            <select
              value={selectedStatusIsAllowed ? selectedStatus : 0}
              onChange={(e) => setSelectedStatus(Number(e.target.value))}
              className="qa-select"
              disabled={statuses.length === 0}
            >
              <option value={0}>Select new status...</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {statuses.length === 0 && (
              <p className="muted entry-meta">No allowed status transitions are available for this issue.</p>
            )}
            <button
              className="qa-button primary"
              onClick={() => selectedStatusIsAllowed && onStatusChange(selectedStatus)}
              disabled={!selectedStatusIsAllowed}
            >
              Update Status
            </button>
          </div>
        )}

        {activeTab === "assign" && (
          <div className="qa-section">
            <label className="qa-label">
              Current: <strong>{currentAssignee || "Unassigned"}</strong>
            </label>
            {users.length > 10 && (
              <input
                type="text"
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setSelectedUser(0); }}
                placeholder="Search users..."
                className="qa-input qa-user-search"
              />
            )}
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(Number(e.target.value))}
              className="qa-select qa-user-select"
              size={Math.min(filteredUsers.length + 1, 12)}
              disabled={filteredUsers.length === 0 && !userSearch}
            >
              <option value={0}>Select user...</option>
              {filteredUsers.length === 0 && userSearch ? (
                <option disabled>No users match "{userSearch}"</option>
              ) : (
                filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))
              )}
            </select>
            {users.length === 0 && (
              <p className="muted entry-meta">No assignable Redmine users are available from the current cache.</p>
            )}
            <p className="muted entry-meta">{users.length} user(s) loaded{userSearch ? ` • ${filteredUsers.length} shown` : ""}</p>
            <button
              className="qa-button primary"
              onClick={() => selectedUser > 0 && onAssign(selectedUser)}
              disabled={selectedUser === 0 || (filteredUsers.length === 0 && !userSearch)}
            >
              Assign
            </button>
          </div>
        )}

        {activeTab === "time" && (
          <div className="qa-section">
            <label className="qa-label">Log Time</label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Hours"
              step="0.25"
              min="0"
              className="qa-input"
            />
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Work description"
              className="qa-input"
            />
            <button
              className="qa-button primary"
              onClick={handleTimeSubmit}
              disabled={!hours || parseFloat(hours) <= 0}
            >
              Log Time
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
