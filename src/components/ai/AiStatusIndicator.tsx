"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

const MODEL_STORAGE_KEY = "nrcc.ai.model";

export function AiStatusIndicator({ onStatusChange }: AiStatusIndicatorProps) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load saved model from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved) {
      setSelectedModel(saved);
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setShowModelSelector(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const fetchStatus = useCallback(async () => {
    try {
      // Include selected model override in request if set
      const url = selectedModel ? `/api/ai/status?model=${encodeURIComponent(selectedModel)}` : "/api/ai/status";
      const res = await fetch(url, { cache: "no-store" });
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
  }, [onStatusChange, selectedModel]);

  useEffect(() => {
    void fetchStatus();
    // Refresh status every 60 seconds
    const interval = setInterval(() => {
      void fetchStatus();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    localStorage.setItem(MODEL_STORAGE_KEY, modelName);
    setShowModelSelector(false);
    // Refresh to test the new model
    void fetchStatus();
  };

  const handleResetModel = () => {
    setSelectedModel(null);
    localStorage.removeItem(MODEL_STORAGE_KEY);
    void fetchStatus();
  };

  if (loading) {
    return (
      <span className="ai-status-indicator ai-status-loading" title="Loading AI status...">
        <span className="ai-status-dot ai-status-dot-loading" />
        <span className="ai-status-text">AI</span>
      </span>
    );
  }

  const isHealthy = status?.available ?? false;
  const currentModel = selectedModel || status?.primaryModel || "default";

  return (
    <div className="ai-status-wrapper">
      <button
        type="button"
        className={`ai-status-indicator ${isHealthy ? "ai-status-healthy" : "ai-status-unhealthy"}`}
        onClick={() => setShowDropdown(!showDropdown)}
        title={isHealthy ? `AI: ${currentModel}` : `AI: ${status?.error || "Unavailable"}`}
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
                <div className="ai-model-selector">
                  <button
                    type="button"
                    className="ai-model-current"
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    title="Click to change model"
                  >
                    {selectedModel ? (
                      <span className="ai-model-selected">{selectedModel}</span>
                    ) : (
                      <span className="ai-model-default">{status.primaryModel}</span>
                    )}
                    <span className="ai-model-arrow">{showModelSelector ? "▲" : "▼"}</span>
                  </button>
                  {showModelSelector && status.models && status.models.length > 0 && (
                    <div className="ai-model-dropdown">
                      <button
                        type="button"
                        className="ai-model-option ai-model-option-reset"
                        onClick={handleResetModel}
                      >
                        Use Default ({status.primaryModel})
                      </button>
                      {status.models.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={`ai-model-option ${selectedModel === model.name ? "ai-model-option-active" : ""}`}
                          onClick={() => handleModelChange(model.name)}
                        >
                          {model.name}
                          {model.description && (
                            <span className="ai-model-option-desc">{model.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {selectedModel && (
                <div className="ai-status-row ai-status-custom">
                  <span className="ai-status-label">Custom</span>
                  <span className="ai-status-value">Override active</span>
                </div>
              )}
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
                  {status.models.map((model) => (
                    <div key={model.id} className="ai-model-item">
                      <span className="ai-model-name">{model.name}</span>
                      {model.description && (
                        <span className="ai-model-desc">{model.description}</span>
                      )}
                    </div>
                  ))}
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
          min-width: 300px;
          max-height: 400px;
          overflow-y: auto;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          padding: 1rem;
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }

        .ai-status-dropdown::-webkit-scrollbar {
          width: 6px;
        }

        .ai-status-dropdown::-webkit-scrollbar-track {
          background: transparent;
        }

        .ai-status-dropdown::-webkit-scrollbar-thumb {
          background-color: #d1d5db;
          border-radius: 3px;
        }

        .ai-status-dropdown::-webkit-scrollbar-thumb:hover {
          background-color: #9ca3af;
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
          max-height: 180px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }

        .ai-model-list::-webkit-scrollbar {
          width: 6px;
        }

        .ai-model-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .ai-model-list::-webkit-scrollbar-thumb {
          background-color: #d1d5db;
          border-radius: 3px;
        }

        .ai-model-list::-webkit-scrollbar-thumb:hover {
          background-color: #9ca3af;
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

        .ai-model-selector {
          position: relative;
        }

        .ai-model-current {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 0.2rem 0.5rem;
          font-size: 0.8rem;
          font-family: monospace;
          cursor: pointer;
          transition: all 0.2s;
          max-width: 180px;
        }

        .ai-model-current:hover {
          background: #e5e7eb;
          border-color: #d1d5db;
        }

        .ai-model-selected {
          color: #667eea;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ai-model-default {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ai-model-arrow {
          font-size: 0.6rem;
          color: #6b7280;
          flex-shrink: 0;
        }

        .ai-model-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 0.25rem;
          min-width: 200px;
          max-height: 250px;
          overflow-y: auto;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 1001;
          scrollbar-width: thin;
          scrollbar-color: #d1d5db transparent;
        }

        .ai-model-dropdown::-webkit-scrollbar {
          width: 5px;
        }

        .ai-model-dropdown::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }

        .ai-model-option {
          display: flex;
          flex-direction: column;
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: none;
          border: none;
          text-align: left;
          font-size: 0.8rem;
          font-family: monospace;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #f3f4f6;
        }

        .ai-model-option:last-child {
          border-bottom: none;
        }

        .ai-model-option:hover {
          background: #f9fafb;
        }

        .ai-model-option-active {
          background: #eef2ff;
          color: #4f46e5;
          font-weight: 600;
        }

        .ai-model-option-reset {
          color: #6b7280;
          font-family: system-ui;
          font-size: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          padding: 0.4rem 0.75rem;
        }

        .ai-model-option-desc {
          font-size: 0.65rem;
          color: #9ca3af;
          font-family: system-ui;
          margin-top: 0.1rem;
        }

        .ai-status-custom {
          color: #667eea;
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
