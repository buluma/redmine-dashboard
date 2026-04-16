"use client";

import { useState, useCallback } from "react";
import { useI18n } from "./I18nProvider";

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
  const { t } = useI18n();
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
        <span className="qa-title">{t("quickActions.title")}</span>
        <span className="qa-issue">#{issueId}</span>
      </div>
      <div className="qa-meta-row">
        <span className="qa-meta-pill">{t("quickActions.status")}: {currentStatus}</span>
        <span className="qa-meta-pill">{t("quickActions.assignee")}: {currentAssignee || t("quickActions.unassigned")}</span>
      </div>

      <div className="qa-tabs">
        <button
          className={activeTab === "status" ? "active" : ""}
          onClick={() => setActiveTab("status")}
        >
          {t("quickActions.tabs.status")}
        </button>
        <button
          className={activeTab === "assign" ? "active" : ""}
          onClick={() => setActiveTab("assign")}
        >
          {t("quickActions.tabs.assign")}
        </button>
        <button
          className={activeTab === "time" ? "active" : ""}
          onClick={() => setActiveTab("time")}
        >
          {t("quickActions.tabs.time")}
        </button>
      </div>

      <div className="qa-content">
        {activeTab === "status" && (
          <div className="qa-section">
            <label className="qa-label">
              {t("quickActions.current")}: <strong>{currentStatus}</strong>
            </label>
            <select
              value={selectedStatusIsAllowed ? selectedStatus : 0}
              onChange={(e) => setSelectedStatus(Number(e.target.value))}
              className="qa-select"
              disabled={statuses.length === 0}
            >
              <option value={0}>{t("quickActions.selectStatus")}</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {statuses.length === 0 && (
              <p className="muted entry-meta">{t("quickActions.noStatusTransitions")}</p>
            )}
            <button
              className="qa-button primary"
              onClick={() => selectedStatusIsAllowed && onStatusChange(selectedStatus)}
              disabled={!selectedStatusIsAllowed}
            >
              {t("quickActions.updateStatus")}
            </button>
          </div>
        )}

        {activeTab === "assign" && (
          <div className="qa-section">
            <label className="qa-label">
              {t("quickActions.current")}: <strong>{currentAssignee || t("quickActions.unassigned")}</strong>
            </label>
            {users.length > 10 && (
              <input
                type="text"
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setSelectedUser(0); }}
                placeholder={t("quickActions.searchUsers")}
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
              <option value={0}>{t("quickActions.selectUser")}</option>
              {filteredUsers.length === 0 && userSearch ? (
                <option disabled>{t("quickActions.noUsersMatch", { search: userSearch })}</option>
              ) : (
                filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))
              )}
            </select>
            {users.length === 0 && (
              <p className="muted entry-meta">{t("quickActions.noAssignableUsers")}</p>
            )}
            <p className="muted entry-meta">{t("quickActions.usersLoaded", { count: users.length, shown: userSearch ? filteredUsers.length : users.length })}</p>
            <button
              className="qa-button primary"
              onClick={() => selectedUser > 0 && onAssign(selectedUser)}
              disabled={selectedUser === 0 || (filteredUsers.length === 0 && !userSearch)}
            >
              {t("quickActions.assign")}
            </button>
          </div>
        )}

        {activeTab === "time" && (
          <div className="qa-section">
            <label className="qa-label">{t("quickActions.logTime")}</label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder={t("quickActions.hoursPlaceholder")}
              step="0.25"
              min="0"
              className="qa-input"
            />
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("quickActions.workDescription")}
              className="qa-input"
            />
            <button
              className="qa-button primary"
              onClick={handleTimeSubmit}
              disabled={!hours || parseFloat(hours) <= 0}
            >
              {t("quickActions.logTimeButton")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
