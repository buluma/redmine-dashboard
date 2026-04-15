"use client";

import { useState, useEffect, useCallback } from "react";

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

interface NotificationsPanelProps {
  pollingInterval?: number; // ms, default 30000 (30s)
}

export function NotificationsPanel({ pollingInterval = 30000 }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);
    const interval = window.setInterval(() => {
      void fetchNotifications();
    }, pollingInterval);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [fetchNotifications, pollingInterval]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "success": return "✅";
      case "error": return "❌";
      case "warning": return "⚠️";
      default: return "ℹ️";
    }
  };

  return (
    <div className="notifications-panel">
      <button
        type="button"
        className="notif-trigger"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {isLoading ? (
              <span className="notif-loading">Loading...</span>
            ) : (
              <div className="notif-actions">
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="notif-action">
                    Mark all read
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="notif-list">
            {isLoading ? (
              <p className="notif-empty">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="notif-empty">No notifications</p>
            ) : (
              notifications.map((notif) => (
                <a
                  key={notif.id}
                  href={notif.link || "#"}
                  className={`notif-item ${notif.type} ${notif.read ? "read" : ""}`}
                  onClick={() => {
                    markAsRead(notif.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="notif-icon">{getTypeIcon(notif.type)}</span>
                  <div className="notif-content">
                    <div className="notif-row">
                      <p className="notif-title">{notif.title}</p>
                      <span className="notif-time">{formatTime(notif.timestamp)}</span>
                    </div>
                    <p className="notif-message" title={notif.message}>{notif.message}</p>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
