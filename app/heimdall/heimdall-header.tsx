"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshButton } from "./refresh-button";
import { useI18n } from "@/src/components/I18nProvider";

interface HeimdallHeaderProps {
  totalLogs: number;
  errorCount: number;
  hostCount: number;
}

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function HeimdallHeader({ totalLogs, errorCount, hostCount }: HeimdallHeaderProps) {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_INTERVAL_MS / 1000);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const { t } = useI18n();

  const handleRefresh = useCallback(() => {
    setLastRefresh(new Date());
    setNextRefreshIn(AUTO_REFRESH_INTERVAL_MS / 1000);
    window.location.reload();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      setNextRefreshIn((prev) => {
        if (prev <= 1) {
          handleRefresh();
          return AUTO_REFRESH_INTERVAL_MS / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, handleRefresh]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{t("heimdall.kicker")}</p>
          <h1>{t("heimdall.title")}</h1>
          <p className="muted">
            {t("heimdall.summary", { 
              total: totalLogs, 
              errors: errorCount, 
              hosts: hostCount 
            })}
          </p>
        </div>
        <div className="hero-actions">
          <RefreshButton />
          
          {/* Auto-refresh toggle */}
          <button
            type="button"
            className={`auto-refresh-toggle ${autoRefreshEnabled ? "active" : ""}`}
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            title={autoRefreshEnabled ? t("heimdall.autoRefreshOn") : t("heimdall.autoRefreshOff")}
          >
            <span className="toggle-indicator" />
            {autoRefreshEnabled ? t("common.on") : t("common.off")}
          </button>

          {autoRefreshEnabled && (
            <span className="refresh-timer" title={`Last refresh: ${formatTime(lastRefresh)}`}>
              ↻ {nextRefreshIn}s
            </span>
          )}
        </div>
      </div>

      <style jsx>{`
        .auto-refresh-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.85rem;
          border: 1px solid var(--border, #e0e0e0);
          border-radius: 6px;
          background: transparent;
          color: var(--text, #222);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .auto-refresh-toggle:hover {
          background: rgba(102, 126, 234, 0.1);
        }

        .auto-refresh-toggle.active {
          background: #f0f9ff;
          border-color: #0d6efd;
          color: #0d6efd;
        }

        .toggle-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border, #e0e0e0);
        }

        .auto-refresh-toggle.active .toggle-indicator {
          background: #0d6efd;
          box-shadow: 0 0 6px #0d6efd;
        }

        .refresh-timer {
          font-size: 0.75rem;
          color: var(--muted, #888);
          font-family: monospace;
          min-width: 45px;
        }
      `}</style>
    </header>
  );
}
