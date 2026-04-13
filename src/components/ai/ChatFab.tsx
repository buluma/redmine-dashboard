"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  totalDuration?: string | null;
  loadDuration?: string | null;
  promptEvalCount?: number | null;
  promptEvalDuration?: string | null;
  evalCount?: number | null;
  evalDuration?: string | null;
};

export function ChatFab({ issueId }: { issueId: number }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatDuration = (ns: bigint | string | number | null): string => {
    if (ns == null) return "—";
    const nsNum = typeof ns === "string" ? BigInt(ns) : typeof ns === "bigint" ? ns : BigInt(ns);
    const ms = Number(nsNum) / 1_000_000;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Load chat history when opened
  useEffect(() => {
    if (!open || loadedHistory) return;
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const res = await fetch(`/api/ai/chat?redmineIssueId=${issueId}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.messages)) {
            setMessages(data.messages.map((m: { role: string; content: string; totalDuration: string | null; loadDuration: string | null; promptEvalCount: number | null; promptEvalDuration: string | null; evalCount: number | null; evalDuration: string | null }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              totalDuration: m.totalDuration,
              loadDuration: m.loadDuration,
              promptEvalCount: m.promptEvalCount,
              promptEvalDuration: m.promptEvalDuration,
              evalCount: m.evalCount,
              evalDuration: m.evalDuration,
            })));
          }
        }
      } catch {
        // Ignore load errors, start fresh
      } finally {
        if (!cancelled) setLoadedHistory(true);
      }
    };
    void loadHistory();
    return () => { cancelled = true; };
  }, [open, issueId, loadedHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redmineIssueId: issueId, messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Chat failed");
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  }, [input, messages, issueId, loading]);

  const clearChat = useCallback(async () => {
    try {
      await fetch(`/api/ai/chat?redmineIssueId=${issueId}`, { method: "DELETE" });
    } catch {
      // Ignore clear errors
    }
    setMessages([]);
    setError(null);
  }, [issueId]);

  if (!open) {
    return (
      <button
        type="button"
        className="chat-fab-btn"
        onClick={() => setOpen(true)}
        title="AI Chat"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <h4>💬 AI Chat</h4>
          <span className="chat-subtitle">Ask about #{issueId}</span>
        </div>
        <div className="chat-header-actions">
          <button type="button" className="chat-clear-btn" onClick={clearChat} title="Clear chat">
            Clear
          </button>
          <button type="button" className="chat-close-btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p className="chat-empty-icon">🤖</p>
            <p className="chat-empty-text">Ask me anything about this issue</p>
            <p className="chat-empty-hint">I have access to its description, journals, time entries, and attachments.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role === "user" ? "chat-msg-user" : "chat-msg-ai"}`}>
            <div className="chat-msg-avatar">
              {msg.role === "user" ? "👤" : "🤖"}
            </div>
            <div className="chat-msg-body">
              <div className="chat-msg-content">{msg.content}</div>
              {msg.role === "assistant" && (msg.totalDuration || msg.evalCount) && (
                <div className="chat-msg-metrics">
                  {msg.totalDuration && (
                    <span className="chat-metric-badge">
                      ⏱ {formatDuration(msg.totalDuration)}
                    </span>
                  )}
                  {msg.promptEvalCount != null && (
                    <span className="chat-metric-badge">
                      📥 {msg.promptEvalCount} tokens
                    </span>
                  )}
                  {msg.evalCount != null && (
                    <span className="chat-metric-badge">
                      📤 {msg.evalCount} tokens
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg-ai">
            <div className="chat-msg-avatar">🤖</div>
            <div className="chat-msg-body">
              <div className="chat-msg-content chat-typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        {error && <p className="chat-error">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="chat-send-btn" disabled={loading || !input.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
