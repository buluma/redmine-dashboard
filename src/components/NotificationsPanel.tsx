"use client";

import { useState, useEffect } from "react";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationsPanelProps {
  initialNotifications?: Notification[];
}

export function NotificationsPanel({ initialNotifications = [] }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);

  // Demo notifications (in real app, these would come from WebSocket/Poll)
  useEffect(() => {
    if (notifications.length === 0) {
      setNotifications([
        {
          id: "1",
          type: "info" as const,
          message: "Sync completed successfully",
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
          read: false,
        },
        {
          id: "2",
          type: "success" as const,
          message: "Issue #112345 updated",
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
          read: true,
        },
      ]);
    }
  }, []); // Empty deps - run once on mount

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="notifications-panel">
      <button
        type="button"
        className="notif-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            <div className="notif-actions">
              <button type="button" onClick={markAllRead} className="notif-action">
                Mark all read
              </button>
              <button type="button" onClick={clearAll} className="notif-action">
                Clear
              </button>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <p className="notif-empty">No notifications</p>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.type} ${notif.read ? "read" : ""}`}
                  onClick={() => markAsRead(notif.id)}
                >
                  <span className="notif-icon">
                    {notif.type === "success" && "✅"}
                    {notif.type === "error" && "❌"}
                    {notif.type === "warning" && "⚠️"}
                    {notif.type === "info" && "ℹ️"}
                  </span>
                  <div className="notif-content">
                    <p className="notif-message">{notif.message}</p>
                    <span className="notif-time">{formatTime(notif.timestamp)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
