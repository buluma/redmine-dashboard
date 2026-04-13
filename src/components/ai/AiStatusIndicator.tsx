"use client";

import { useEffect, useState, useCallback } from "react";

interface AiStatus {
  available: boolean;
  provider: string;
  primaryModel: string;
  usingFallback: boolean;
  error?: string;
  models: Array<{ id: string; name: string; description?: string }>;
  config: {
    features: {
      summarize: boolean;
      search: boolean;
      categorize: boolean;
      chat: boolean;
    };
  };
}

interface AiStatusIndicatorProps {
  onStatusChange?: (available: boolean) => void;
}

export function AiStatusIndicator({ onStatusChange }: AiStatusIndicatorProps) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setError(null);
        onStatusChange?.(data.available);
      } else {
        setError("Failed to fetch AI status");
        onStatusChange?.(false);
      }
    } catch {
      setError("AI service unavailable");
      onStatusChange?.(false);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    void fetchStatus();
    // Refresh status every 60 seconds
    const interval = setInterval(() => {
      void fetchStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading) {
    return (
      <span className="ai-status-indicator ai-status-loading" title="Loading AI status...">
        <span className="ai-status-dot ai-status-dot-loading" />
        <span className="ai-status-text">AI</span>
      </span>
    );
  }

  const isHealthy = status?.available ?? false;

  return (
    <div className="ai-status-wrapper">
      <button
        type="button"
        className={`ai-status-indicator ${isHealthy ? "ai-status-healthy" : "ai-status-unhealthy"}`}
        onClick={() => setShowDropdown(!showDropdown)}
        title={isHealthy ? `AI: ${status?.primaryModel}` : `AI: ${status?.error || "Unavailable"}`}
      >
        <span className={`ai-status-dot ${isHealthy ? "ai-status-dot-healthy" : "ai-status-dot-unhealthy"}`} />
        <span className="ai-status-text">AI</span>
        {status?.usingFallback && <span className="ai-status-fallback" title="Using fallback model">⚠️</span>}
      </button>

      {showDropdown && status && (
        <>
          <div className="ai-status-backdrop" onClick={() => setShowDropdown(false)} />
          <div className="ai-status-dropdown">
            <div className="ai-status-header">
              <h4>AI Status</h4>
              <span className={`ai-status-badge ${isHealthy ? "badge-success" : "badge-error"}`}>
                {isHealthy ? "Online" : "Offline"}
              </span>
            </div>

            <div className="ai-status-info">
              <div className="ai-status-row">
                <span className="ai-status-label">Provider</span>
                <span className="ai-status-value">{status.provider}</span>
              </div>
              <div className="ai-status-row">
                <span className="ai-status-label">Model</span>
                <span className="ai-status-value">{status.primaryModel}</span>
              </div>
              {status.usingFallback && (
                <div className="ai-status-row ai-status-warning">
                  <span className="ai-status-label">Fallback</span>
                  <span className="ai-status-value">Using fallback model</span>
                </div>
              )}
            </div>

            <div className="ai-status-section">
              <h5>Features</h5>
              <div className="ai-status-features">
                {status.config?.features?.summarize && (
                  <span className="ai-feature-badge">📝 Summarize</span>
                )}
                {status.config?.features?.search && (
                  <span className="ai-feature-badge">🔍 Search</span>
                )}
                {status.config?.features?.categorize && (
                  <span className="ai-feature-badge">🏷️ Categorize</span>
                )}
                {status.config?.features?.chat && (
                  <span className="ai-feature-badge">💬 Chat</span>
                )}
              </div>
            </div>

            {status.models && status.models.length > 0 && (
              <div className="ai-status-section">
                <h5>Available Models ({status.models.length})</h5>
                <div className="ai-model-list">
                  {status.models.slice(0, 5).map((model) => (
                    <div key={model.id} className="ai-model-item">
                      <span className="ai-model-name">{model.name}</span>
                      {model.description && (
                        <span className="ai-model-desc">{model.description}</span>
                      )}
                    </div>
                  ))}
                  {status.models.length > 5 && (
                    <div className="ai-model-more">
                      +{status.models.length - 5} more models
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="ai-status-actions">
              <button
                type="button"
                className="ai-status-refresh"
                onClick={() => {
                  setLoading(true);
                  void fetchStatus();
                }}
              >
                🔄 Refresh
              </button>
            </div>

            {error && (
              <div className="ai-status-error">
                {error}
              </div>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .ai-status-wrapper {
          position: relative;
          display: inline-flex;
        }

        .ai-status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.6rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .ai-status-indicator:hover {
          background: rgba(102, 126, 234, 0.1);
        }

        .ai-status-healthy {
          color: #10b981;
        }

        .ai-status-unhealthy {
          color: #ef4444;
        }

        .ai-status-loading {
          color: #6b7280;
        }

        .ai-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .ai-status-dot-healthy {
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .ai-status-dot-unhealthy {
          background: #ef4444;
        }

        .ai-status-dot-loading {
          background: #6b7280;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .ai-status-text {
          font-family: monospace;
        }

        .ai-status-fallback {
          font-size: 0.65rem;
        }

        .ai-status-backdrop {
          position: fixed;
          inset: 0;
          z-index: 999;
        }

        .ai-status-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 0.5rem;
          min-width: 280px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          padding: 1rem;
        }

        .ai-status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .ai-status-header h4 {
          margin: 0;
          font-size: 0.9rem;
        }

        .ai-status-badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-error {
          background: #fee2e2;
          color: #991b1b;
        }

        .ai-status-info {
          margin-bottom: 0.75rem;
        }

        .ai-status-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.25rem 0;
        }

        .ai-status-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .ai-status-value {
          font-size: 0.8rem;
          font-weight: 500;
          font-family: monospace;
        }

        .ai-status-warning {
          color: #d97706;
        }

        .ai-status-section {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #f3f4f6;
        }

        .ai-status-section h5 {
          margin: 0 0 0.5rem 0;
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
        }

        .ai-status-features {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .ai-feature-badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.4rem;
          background: #f3f4f6;
          border-radius: 4px;
        }

        .ai-model-list {
          max-height: 120px;
          overflow-y: auto;
        }

        .ai-model-item {
          display: flex;
          flex-direction: column;
          padding: 0.25rem 0;
        }

        .ai-model-name {
          font-size: 0.8rem;
          font-family: monospace;
        }

        .ai-model-desc {
          font-size: 0.7rem;
          color: #6b7280;
        }

        .ai-model-more {
          font-size: 0.75rem;
          color: #6b7280;
          padding-top: 0.25rem;
        }

        .ai-status-actions {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid #f3f4f6;
        }

        .ai-status-refresh {
          width: 100%;
          padding: 0.4rem;
          background: #f3f4f6;
          border: none;
          border-radius: 4px;
          font-size: 0.75rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .ai-status-refresh:hover {
          background: #e5e7eb;
        }

        .ai-status-error {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: #fee2e2;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #991b1b;
        }
      `}</style>
    </div>
  );
}
