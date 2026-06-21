"use client";

// Removed custom process declaration to avoid duplicate identifier error.
// process.env is handled by Next.js at build time.

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/src/components/I18nProvider";
import { urlBase64ToUint8Array } from "@/src/lib/push-utils";

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
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);

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

  // Initial fetch and polling — pause when tab is hidden to avoid fetch errors
  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);
    let interval = window.setInterval(() => {
      if (!document.hidden) void fetchNotifications();
    }, pollingInterval);
    const onVisibility = () => {
      if (!document.hidden) void fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifications, pollingInterval]);

  // Check push subscription status
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsPushSupported(true);
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setIsSubscribed(!!subscription);
        });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    setIsPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!publicKey) {
        throw new Error(t('notifications.vapidNotFound'));
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });

      if (res.ok) {
        setIsSubscribed(true);
      } else {
        throw new Error(t('notifications.saveSubFailed'));
      }
    } catch (error) {
      console.error(t('notifications.subFailed'), error);
      alert(t('notifications.pushPermissionFailed'));
    } finally {
      setIsPushLoading(false);
    }
  };

  const unsubscribeFromPush = async () => {
    setIsPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
        });
      }
      setIsSubscribed(false);
    } catch (error) {
      console.error("Push unsubscription failed:", error);
    } finally {
      setIsPushLoading(false);
    }
  };

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
    if (mins < 1) return t('notifications.justNow');
    if (mins < 60) return t('notifications.minsAgo', { mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('notifications.hoursAgo', { hours });
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
            <span>{t('notifications.title')}</span>
            {isLoading ? (
              <span className="notif-loading">{t('common.loading')}</span>
            ) : (
              <div className="notif-actions">
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="notif-action">
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="notif-list">
            {isLoading ? (
              <p className="notif-empty">{t('common.loading')}</p>
            ) : notifications.length === 0 ? (
              <p className="notif-empty">{t('notifications.noNotifications')}</p>
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

          {isPushSupported && (
            <div className="notif-footer">
              <button
                type="button"
                className={`push-toggle ${isSubscribed ? "active" : ""}`}
                onClick={isSubscribed ? unsubscribeFromPush : subscribeToPush}
                disabled={isPushLoading}
              >
                {isPushLoading ? t('notifications.working') : isSubscribed ? t('notifications.pushOn') : t('notifications.pushOff')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
