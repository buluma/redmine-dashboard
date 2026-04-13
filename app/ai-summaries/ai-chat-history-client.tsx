"use client";

import Link from "next/link";
import { useState, useMemo } from "react";

type AiChatMessageData = {
  id: string;
  role: string;
  content: string;
  model: string | null;
  totalDuration: bigint | string | null;
  loadDuration: bigint | string | null;
  promptEvalCount: number | null;
  promptEvalDuration: bigint | string | null;
  evalCount: number | null;
  evalDuration: bigint | string | null;
  createdAt: Date;
  issue: {
    redmineIssueId: number;
    redmineBaseUrl: string;
    subject: string;
    statusName: string;
  };
};

interface GroupedChat {
  issueId: number;
  subject: string;
  statusName: string;
  baseUrl: string;
  messages: AiChatMessageData[];
  lastMessage: Date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ns: bigint | string | number | null): string {
  if (ns == null) return "—";
  const nsNum = typeof ns === "string" ? BigInt(ns) : typeof ns === "bigint" ? ns : BigInt(ns);
  const ms = Number(nsNum) / 1_000_000;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getProviderIcon(model: string | null): string {
  if (!model) return "🤖";
  const m = model.toLowerCase();
  if (m.includes("claude")) return "🧠";
  if (m.includes("gpt") || m.includes("openai")) return "💬";
  if (m.includes("llama") || m.includes("mistral") || m.includes("qwen")) return "🦙";
  return "🤖";
}

export function AiChatHistoryClient({ messages }: { messages: AiChatMessageData[] }) {
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [pageSize] = useState(10);
  const [page, setPage] = useState(0);

  // Group messages by issue
  const groupedChats = useMemo(() => {
    const groups = new Map<number, GroupedChat>();

    for (const msg of messages) {
      const issueId = msg.issue.redmineIssueId;
      const existing = groups.get(issueId);

      if (existing) {
        existing.messages.push(msg);
        if (new Date(msg.createdAt) > new Date(existing.lastMessage)) {
          existing.lastMessage = new Date(msg.createdAt);
        }
      } else {
        groups.set(issueId, {
          issueId,
          subject: msg.issue.subject,
          statusName: msg.issue.statusName,
          baseUrl: msg.issue.redmineBaseUrl,
          messages: [msg],
          lastMessage: new Date(msg.createdAt),
        });
      }
    }

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.lastMessage).getTime() - new Date(a.lastMessage).getTime()
    );
  }, [messages]);

  // Filter by search term
  const filteredGroupedChats = useMemo(() => {
    if (!searchTerm.trim()) return groupedChats;
    const term = searchTerm.toLowerCase();
    return groupedChats.filter(
      (chat) =>
        chat.subject.toLowerCase().includes(term) ||
        chat.issueId.toString().includes(term) ||
        chat.messages.some((m) => m.content.toLowerCase().includes(term))
    );
  }, [groupedChats, searchTerm]);

  // Filter flat messages
  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) return messages;
    const term = searchTerm.toLowerCase();
    return messages.filter(
      (msg) =>
        msg.issue.subject.toLowerCase().includes(term) ||
        msg.issue.redmineIssueId.toString().includes(term) ||
        msg.content.toLowerCase().includes(term)
    );
  }, [messages, searchTerm]);

  const paginatedGrouped = useMemo(() => {
    const start = page * pageSize;
    return filteredGroupedChats.slice(start, start + pageSize);
  }, [filteredGroupedChats, page, pageSize]);

  const paginatedFlat = useMemo(() => {
    const start = page * pageSize;
    return filteredMessages.slice(start, start + pageSize);
  }, [filteredMessages, page, pageSize]);

  const totalPages = viewMode === "grouped" 
    ? Math.ceil(filteredGroupedChats.length / pageSize)
    : Math.ceil(filteredMessages.length / pageSize);

  const toggleIssue = (issueId: number) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  const totalItems = viewMode === "grouped" ? filteredGroupedChats.length : filteredMessages.length;

  return (
    <div className="chat-history-container">
      {/* Toolbar */}
      <div className="chat-toolbar">
        <div className="chat-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            className="chat-search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="chat-search-clear"
              onClick={() => setSearchTerm("")}
            >
              ×
            </button>
          )}
        </div>

        <div className="chat-view-toggle">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === "grouped" ? "active" : ""}`}
            onClick={() => {
              setViewMode("grouped");
              setPage(0);
            }}
          >
            📁 Grouped ({groupedChats.length})
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === "flat" ? "active" : ""}`}
            onClick={() => {
              setViewMode("flat");
              setPage(0);
            }}
          >
            📋 Flat ({messages.length})
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="chat-results">
        {viewMode === "grouped" ? (
          <>
            {paginatedGrouped.length === 0 ? (
              <p className="muted" style={{ padding: "1rem 0" }}>
                {searchTerm ? "No messages match your search." : "No chat messages yet."}
              </p>
            ) : (
              paginatedGrouped.map((chat) => {
                const isExpanded = expandedIssues.has(chat.issueId);
                const userMsgs = chat.messages.filter((m) => m.role === "user").length;
                const aiMsgs = chat.messages.filter((m) => m.role === "assistant").length;

                return (
                  <div key={chat.issueId} className="chat-issue-group">
                    <button
                      type="button"
                      className="chat-issue-header"
                      onClick={() => toggleIssue(chat.issueId)}
                    >
                      <span className="chat-issue-toggle">{isExpanded ? "▼" : "▶"}</span>
                      <Link
                        href={`/issues/${chat.issueId}`}
                        className="chat-issue-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{chat.issueId}
                      </Link>
                      <span className="chat-issue-subject">{chat.subject}</span>
                      <span className="chat-issue-meta">
                        <span className="chat-status-badge">{chat.statusName}</span>
                        <span className="chat-count">
                          {chat.messages.length} msg · {userMsgs} 👤 · {aiMsgs} 🤖
                        </span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="chat-issue-messages">
                        {chat.messages
                          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                          .map((msg) => (
                            <article
                              key={msg.id}
                              className={`summary-card chat-card chat-${msg.role}`}
                            >
                              <div className="summary-header">
                                <div className="summary-issue-info">
                                  <div className="summary-meta">
                                    <span className={`chat-role-badge chat-role-${msg.role}`}>
                                      {msg.role === "user" ? "👤 You" : "🤖 AI"}
                                    </span>
                                  </div>
                                </div>
                                <div className="summary-side">
                                  {msg.model && (
                                    <span className="summary-model">
                                      {getProviderIcon(msg.model)} {msg.model}
                                    </span>
                                  )}
                                  <span className="summary-date">
                                    {formatDate(new Date(msg.createdAt))}
                                  </span>
                                </div>
                              </div>

                              <div className="ai-result">
                                <div className="ai-result-header">
                                  <h5>{msg.role === "user" ? "Your Question" : "AI Response"}</h5>
                                </div>

                                <div className="ai-section">
                                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                                    {msg.content}
                                  </p>
                                </div>

                                {msg.role === "assistant" && (msg.totalDuration || msg.evalCount || msg.loadDuration) && (
                                  <div className="ai-footer">
                                    {msg.loadDuration && (
                                      <span className="ai-perf-badge">Load: {formatDuration(msg.loadDuration)}</span>
                                    )}
                                    {msg.totalDuration && (
                                      <span className="ai-perf-badge">Total Time: {formatDuration(msg.totalDuration)}</span>
                                    )}
                                    {msg.promptEvalCount != null && (
                                      <span className="ai-perf-badge">Prompt: {msg.promptEvalCount}</span>
                                    )}
                                    {msg.promptEvalDuration && (
                                      <span className="ai-perf-badge">Prompt time: {formatDuration(msg.promptEvalDuration)}</span>
                                    )}
                                    {msg.evalCount != null && (
                                      <span className="ai-perf-badge">Tokens: {msg.evalCount}</span>
                                    )}
                                    {msg.evalDuration && (
                                      <span className="ai-perf-badge">Gen: {formatDuration(msg.evalDuration)}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </article>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        ) : (
          <>
            {paginatedFlat.length === 0 ? (
              <p className="muted" style={{ padding: "1rem 0" }}>
                {searchTerm ? "No messages match your search." : "No chat messages yet."}
              </p>
            ) : (
              paginatedFlat.map((msg) => (
                <article key={msg.id} className={`summary-card chat-card chat-${msg.role}`}>
                  <div className="summary-header">
                    <div className="summary-issue-info">
                      <Link
                        href={`/issues/${msg.issue.redmineIssueId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="summary-issue-link"
                      >
                        #{msg.issue.redmineIssueId} - {msg.issue.subject}
                      </Link>
                      <div className="summary-meta">
                        <span className={`chat-role-badge chat-role-${msg.role}`}>
                          {msg.role === "user" ? "👤 You" : "🤖 AI"}
                        </span>
                        <span className="chat-status-badge">{msg.issue.statusName}</span>
                      </div>
                    </div>
                    <div className="summary-side">
                      {msg.model && (
                        <span className="summary-model">
                          {getProviderIcon(msg.model)} {msg.model}
                        </span>
                      )}
                      <span className="summary-date">{formatDate(new Date(msg.createdAt))}</span>
                    </div>
                  </div>

                  <div className="ai-result">
                    <div className="ai-result-header">
                      <h5>{msg.role === "user" ? "Your Question" : "AI Response"}</h5>
                    </div>

                    <div className="ai-section">
                      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{msg.content}</p>
                    </div>

                    {msg.role === "assistant" && (msg.totalDuration || msg.evalCount || msg.loadDuration) && (
                      <div className="ai-footer">
                        {msg.loadDuration && (
                          <span className="ai-perf-badge">Load: {formatDuration(msg.loadDuration)}</span>
                        )}
                        {msg.totalDuration && (
                          <span className="ai-perf-badge">Total Time: {formatDuration(msg.totalDuration)}</span>
                        )}
                        {msg.promptEvalCount != null && (
                          <span className="ai-perf-badge">Prompt: {msg.promptEvalCount}</span>
                        )}
                        {msg.promptEvalDuration && (
                          <span className="ai-perf-badge">Prompt time: {formatDuration(msg.promptEvalDuration)}</span>
                        )}
                        {msg.evalCount != null && (
                          <span className="ai-perf-badge">Tokens: {msg.evalCount}</span>
                        )}
                        {msg.evalDuration && (
                          <span className="ai-perf-badge">Gen: {formatDuration(msg.evalDuration)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="chat-pagination">
          <span className="pagination-info">
            Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalItems)} of {totalItems}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage(0)}
              disabled={page === 0}
            >
              ««
            </button>
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              «
            </button>
            <span className="pagination-current">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              »
            </button>
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
            >
              »»
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .chat-history-container {
          margin-top: 1rem;
        }

        .chat-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .chat-search {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 6px;
          background: white;
          flex: 1;
          max-width: 320px;
        }

        .chat-search svg {
          color: #9ca3af;
          flex-shrink: 0;
        }

        .chat-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          background: transparent;
        }

        .chat-search-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 1.2rem;
          padding: 0;
          line-height: 1;
        }

        .chat-search-clear:hover {
          color: #6b7280;
        }

        .chat-view-toggle {
          display: flex;
          gap: 0.5rem;
        }

        .view-toggle-btn {
          padding: 0.4rem 0.75rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 6px;
          background: white;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .view-toggle-btn:hover {
          background: #f3f4f6;
        }

        .view-toggle-btn.active {
          background: #8b5cf6;
          color: white;
          border-color: #8b5cf6;
        }

        .chat-results {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .chat-issue-group {
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
          overflow: hidden;
        }

        .chat-issue-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          background: #f9fafb;
          border: none;
          cursor: pointer;
          text-align: left;
          font-size: 0.875rem;
        }

        .chat-issue-header:hover {
          background: #f3f4f6;
        }

        .chat-issue-toggle {
          font-size: 0.7rem;
          color: #6b7280;
          width: 16px;
        }

        .chat-issue-link {
          font-weight: 600;
          color: #8b5cf6;
          text-decoration: none;
          font-family: monospace;
        }

        .chat-issue-link:hover {
          text-decoration: underline;
        }

        .chat-issue-subject {
          flex: 1;
          color: var(--text, #374151);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .chat-issue-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .chat-status-badge {
          padding: 0.15rem 0.4rem;
          background: #e5e7eb;
          border-radius: 4px;
          font-size: 0.7rem;
        }

        .chat-count {
          font-family: monospace;
        }

        .chat-issue-messages {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: white;
          max-height: 600px;
          overflow-y: auto;
        }

        .chat-role-badge {
          font-size: 0.75rem;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }

        .chat-role-user {
          background: #dbeafe;
          color: #1e40af;
        }

        .chat-role-assistant {
          background: #d1fae5;
          color: #065f46;
        }

        .chat-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border, #e5e7eb);
        }

        .pagination-info {
          font-size: 0.8rem;
          color: #6b7280;
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .pagination-btn {
          padding: 0.35rem 0.6rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s;
        }

        .pagination-btn:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagination-current {
          font-size: 0.8rem;
          font-family: monospace;
          padding: 0 0.5rem;
        }

        .ai-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          padding-top: 0.75rem;
          margin-top: 0.75rem;
          border-top: 1px solid #f3f4f6;
        }

        .ai-perf-badge {
          font-size: 0.7rem;
          padding: 0.2rem 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          color: #6b7280;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
