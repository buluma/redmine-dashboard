"use client";

import Link from "next/link";

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

export function AiChatHistoryClient({ messages }: { messages: AiChatMessageData[] }) {
  return (
    <div className="summaries-list">
      {messages.map((msg) => (
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
              </div>
            </div>
            <div className="summary-side">
              {msg.model && <span className="summary-model">{msg.model}</span>}
              <span className="summary-date">{formatDate(msg.createdAt)}</span>
            </div>
          </div>

          <div className="ai-result">
            <div className="ai-result-header">
              <h5>{msg.role === "user" ? "Your Question" : "AI Response"}</h5>
              {msg.role === "assistant" && (msg.totalDuration || msg.evalCount) && (
                <div className="ai-perf-grid">
                  {msg.totalDuration && (
                    <span className="ai-perf-badge">
                      Total: {formatDuration(msg.totalDuration)}
                    </span>
                  )}
                  {msg.promptEvalCount != null && (
                    <span className="ai-perf-badge">
                      Prompt tokens: {msg.promptEvalCount}
                    </span>
                  )}
                  {msg.evalCount != null && (
                    <span className="ai-perf-badge">
                      Tokens: {msg.evalCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="ai-section">
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{msg.content}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
