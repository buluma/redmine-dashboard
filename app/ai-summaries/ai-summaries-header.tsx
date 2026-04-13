"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AiStatusIndicator } from "@/src/components/ai/AiStatusIndicator";

interface AiSummariesHeaderProps {
  totalSummaries: number;
  totalChatMessages: number;
  issueCount: number;
  userMessages: number;
}

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function AiSummariesHeader({
  totalSummaries,
  totalChatMessages,
  issueCount,
  userMessages,
}: AiSummariesHeaderProps) {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(AUTO_REFRESH_INTERVAL_MS / 1000);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
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
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">AI Insights</p>
          <h1>AI Summaries</h1>
          <p className="muted">
            {totalSummaries} summary{totalSummaries !== 1 ? "ies" : "y"} · {userMessages} chat messages across {issueCount} issue{issueCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="hero-actions" style={{ overflow: "visible" }}>
          <AiStatusIndicator />

          <button
            className={`refresh-button ${isRefreshing ? "loading" : ""}`}
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? "⟳ Refreshing…" : "⟳ Refresh"}
          </button>

          {/* Auto-refresh toggle */}
          <button
            type="button"
            className={`auto-refresh-toggle ${autoRefreshEnabled ? "active" : ""}`}
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            title={autoRefreshEnabled ? "Auto-refresh enabled (5 min)" : "Auto-refresh disabled"}
          >
            <span className="toggle-indicator" />
            Auto-refresh {autoRefreshEnabled ? "ON" : "OFF"}
          </button>

          {autoRefreshEnabled && (
            <span className="refresh-timer" title={`Last refresh: ${formatTime(lastRefresh)}`}>
              ↻ {nextRefreshIn}s
            </span>
          )}

          <Link href="/" className="primary-link">Back to Dashboard</Link>
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

        .refresh-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 1rem;
          border: 1px solid var(--accent, #8b5cf6);
          border-radius: 6px;
          background: transparent;
          color: var(--accent, #8b5cf6);
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .refresh-button:hover:not(:disabled) {
          background: var(--accent, #8b5cf6);
          color: white;
        }

        .refresh-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .refresh-button.loading {
          background: var(--accent, #8b5cf6);
          color: white;
        }
      `}</style>
    </header>
  );
}
