"use client";

import Link from "next/link";
import { useState } from "react";

interface AiSummaryData {
  id: string;
  summary: string;
  model: string;
  updatedAt: Date;
  totalDuration: bigint | string | null;
  loadDuration: bigint | string | null;
  promptEvalCount: number | null;
  promptEvalDuration: bigint | string | null;
  evalCount: number | null;
  evalDuration: bigint | string | null;
  issue: {
    redmineIssueId: number;
    redmineBaseUrl: string;
    subject: string;
    statusName: string;
    priority: string | null;
    projectName: string | null;
    assignedToName: string | null;
  };
}

interface ParsedSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  confidence: number;
}

function parseSummaryText(text: string | null): ParsedSummary | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary ?? "",
      keyPoints: parsed.keyPoints ?? [],
      actionItems: parsed.actionItems ?? [],
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    return { summary: text, keyPoints: [], actionItems: [], confidence: 0 };
  }
}

function linkify(text: string): React.ReactElement {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="ai-link">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
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

function buildCopyText(summary: string, parsed: ParsedSummary): string {
  const parts: string[] = [];

  if (parsed.summary) {
    parts.push(parsed.summary);
  }

  if (parsed.keyPoints.length > 0) {
    parts.push("\nKey Points:");
    parsed.keyPoints.forEach((point) => parts.push(`• ${point}`));
  }

  if (parsed.actionItems.length > 0) {
    parts.push("\nAction Items:");
    parsed.actionItems.forEach((item) => parts.push(`→ ${item}`));
  }

  if (parsed.confidence > 0) {
    parts.push(`\nConfidence: ${Math.round(parsed.confidence * 100)}%`);
  }

  return parts.join("\n");
}

function CopyButton({ summary, parsed }: { summary: string; parsed: ParsedSummary }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildCopyText(summary, parsed);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      className={`summary-copy-btn ${copied ? "copied" : ""}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy summary to clipboard"}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Copied!</span>
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export function AiSummariesClient({ summaries }: { summaries: AiSummaryData[] }) {
  return (
    <div className="summaries-list">
      {summaries.map((summary) => {
        const parsed = parseSummaryText(summary.summary);

        return (
          <article key={summary.id} className="summary-card">
            <div className="summary-header">
              <div className="summary-issue-info">
                <Link
                  href={`/issues/${summary.issue.redmineIssueId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="summary-issue-link"
                >
                  #{summary.issue.redmineIssueId} - {summary.issue.subject}
                </Link>
                <div className="summary-meta">
                  <span className="summary-status">{summary.issue.statusName}</span>
                  {summary.issue.priority && (
                    <span className="summary-priority">{summary.issue.priority}</span>
                  )}
                  {summary.issue.projectName && (
                    <span className="summary-project">{summary.issue.projectName}</span>
                  )}
                </div>
              </div>
              <div className="summary-side">
                <span className="summary-model">{summary.model}</span>
                <span className="summary-date">{formatDate(summary.updatedAt)}</span>
              </div>
            </div>

            {/* Rendered exactly like AiIssueActions */}
            {parsed && (
              <div className="ai-result">
                <div className="ai-result-header">
                  <h5>AI Summary</h5>
                  <div className="ai-result-actions">
                    {parsed.confidence > 0 && (
                      <span className="ai-confidence">
                        {Math.round(parsed.confidence * 100)}% confident
                      </span>
                    )}
                    <CopyButton summary={summary.summary} parsed={parsed} />
                  </div>
                </div>

                {parsed.summary && (
                  <div className="ai-section">
                    <p>{linkify(parsed.summary)}</p>
                  </div>
                )}

                {parsed.keyPoints.length > 0 && (
                  <div className="ai-section">
                    <h6>Key Points</h6>
                    <ul>
                      {parsed.keyPoints.map((point, i) => (
                        <li key={i}>{linkify(point)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsed.actionItems.length > 0 && (
                  <div className="ai-section">
                    <h6>Action Items</h6>
                    <ul className="action-items">
                      {parsed.actionItems.map((item, i) => (
                        <li key={i}>{linkify(item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="summary-footer">
              <div className="summary-footer-left">
                {summary.issue.assignedToName
                  ? `Assigned to: ${summary.issue.assignedToName}`
                  : "Unassigned"}
              </div>
              {(summary.totalDuration || summary.evalCount) && (
                <div className="summary-footer-right">
                  {summary.totalDuration && (
                    <span className="summary-metric">
                      Total: {formatDuration(summary.totalDuration)}
                    </span>
                  )}
                  {summary.loadDuration && (
                    <span className="summary-metric">
                      Load: {formatDuration(summary.loadDuration)}
                    </span>
                  )}
                  {summary.promptEvalCount != null && (
                    <span className="summary-metric">
                      Prompt tokens: {summary.promptEvalCount}
                    </span>
                  )}
                  {summary.promptEvalDuration && (
                    <span className="summary-metric">
                      Prompt: {formatDuration(summary.promptEvalDuration)}
                    </span>
                  )}
                  {summary.evalCount != null && (
                    <span className="summary-metric">
                      Tokens: {summary.evalCount}
                    </span>
                  )}
                  {summary.evalDuration && (
                    <span className="summary-metric">
                      Gen: {formatDuration(summary.evalDuration)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
