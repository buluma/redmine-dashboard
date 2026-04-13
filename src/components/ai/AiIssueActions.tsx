"use client";

import { useMemo, useState } from "react";
import { AiButton } from "./AiButton";
import { AiLoading } from "./AiLoading";

interface StoredSummary {
  id: string;
  summary: string;
  model: string;
  createdAt: string;
  totalDuration?: string | bigint | null;
  loadDuration?: string | bigint | null;
  promptEvalCount?: number | null;
  promptEvalDuration?: string | bigint | null;
  evalCount?: number | null;
  evalDuration?: string | bigint | null;
}

interface ParsedSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  risks: string[];
  openQuestions: string[];
  timeline: Array<{
    at: string;
    author: string;
    type: "journal" | "time" | "status" | "other";
    detail: string;
  }>;
  timeSpent: {
    totalHours: number;
    entryCount: number;
    byActivity: Array<{ name: string; hours: number }>;
    byAuthor: Array<{ name: string; hours: number }>;
  } | null;
  attachments: Array<{
    filename: string;
    type: string;
    sizeKb: number;
    note: string;
  }>;
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
      risks: parsed.risks ?? [],
      openQuestions: parsed.openQuestions ?? [],
      timeline: parsed.timeline ?? [],
      timeSpent: parsed.timeSpent ?? null,
      attachments: parsed.attachments ?? [],
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    // If not JSON, treat as plain text summary
    return { summary: text, keyPoints: [], actionItems: [], risks: [], openQuestions: [], timeline: [], timeSpent: null, attachments: [], confidence: 0 };
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

interface AiIssueActionsProps {
  issueId: string;
  existingSummaries?: StoredSummary[];
  onSummary?: (summary: string) => void;
  onCategory?: (category: string) => void;
}

export function AiIssueActions({ issueId, existingSummaries = [], onSummary, onCategory }: AiIssueActionsProps) {
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(existingSummaries[0]?.summary ?? null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perfMetrics, setPerfMetrics] = useState<{
    totalDuration: string | bigint | null;
    loadDuration: string | bigint | null;
    promptEvalCount: number | null;
    promptEvalDuration: string | bigint | null;
    evalCount: number | null;
    evalDuration: string | bigint | null;
  } | null>(existingSummaries[0] ? {
    totalDuration: existingSummaries[0].totalDuration ?? null,
    loadDuration: existingSummaries[0].loadDuration ?? null,
    promptEvalCount: existingSummaries[0].promptEvalCount ?? null,
    promptEvalDuration: existingSummaries[0].promptEvalDuration ?? null,
    evalCount: existingSummaries[0].evalCount ?? null,
    evalDuration: existingSummaries[0].evalDuration ?? null,
  } : null);

  const parsedSummary = useMemo(() => parseSummaryText(summary), [summary]);

  const formatDuration = (ns: bigint | string | number | null): string => {
    if (ns == null) return "—";
    const nsNum = typeof ns === "string" ? BigInt(ns) : typeof ns === "bigint" ? ns : BigInt(ns);
    const ms = Number(nsNum) / 1_000_000;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const handleSummarize = async () => {
    setSummaryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Summarization failed");
      }
      const structured = {
        summary: data.summary ?? "",
        keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
        actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
        risks: Array.isArray(data.risks) ? data.risks : [],
        openQuestions: Array.isArray(data.openQuestions) ? data.openQuestions : [],
        timeline: Array.isArray(data.timeline) ? data.timeline : [],
        timeSpent: data.timeSpent ?? null,
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        confidence: typeof data.confidence === "number" ? data.confidence : 0,
      };
      const serialized = JSON.stringify(structured);
      setSummary(serialized);
      setPerfMetrics(data.metrics ?? null);
      onSummary?.(serialized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to summarize");
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCategorize = async () => {
    setCategoryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Categorization failed");
      }
      const categoryText = `Priority: ${data.suggestedPriority?.name || "Unknown"}\nTags: ${data.suggestedTags?.map((t: { name: string }) => t.name).join(", ") || "None"}\nReasoning: ${data.reasoning || ""}`;
      setCategory(categoryText);
      onCategory?.(categoryText);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to categorize");
    } finally {
      setCategoryLoading(false);
    }
  };

  return (
    <div className="ai-issue-actions">
      <div className="ai-actions-header">
        <h4>🤖 AI Actions</h4>
        <span className="ai-powered-by">Powered by ShadowNet</span>
      </div>

      <div className="ai-buttons-row">
        <AiButton onClick={handleSummarize} disabled={summaryLoading} size="sm">
          {summaryLoading ? "Summarizing..." : "Summarize Issue"}
        </AiButton>

        <AiButton onClick={handleCategorize} disabled={categoryLoading} size="sm" variant="secondary">
          {categoryLoading ? "Categorizing..." : "Categorize"}
        </AiButton>
      </div>

      {summaryLoading && <AiLoading message="Generating summary..." size="sm" />}
      {categoryLoading && <AiLoading message="Analyzing issue..." size="sm" />}

      {error && <p className="ai-error">{error}</p>}

      {parsedSummary && (
        <div className="ai-result">
          <div className="ai-result-header">
            <h5>AI Summary</h5>
            {parsedSummary.confidence > 0 && (
              <span className="ai-confidence">
                {Math.round(parsedSummary.confidence * 100)}% confident
              </span>
            )}
          </div>

          {parsedSummary.summary && (
            <div className="ai-section">
              <p>{linkify(parsedSummary.summary)}</p>
            </div>
          )}

          {parsedSummary.keyPoints.length > 0 && (
            <div className="ai-section">
              <h6>Key Points</h6>
              <ul>
                {parsedSummary.keyPoints.map((point, i) => (
                  <li key={i}>{linkify(point)}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedSummary.actionItems.length > 0 && (
            <div className="ai-section">
              <h6>Action Items</h6>
              <ul className="action-items">
                {parsedSummary.actionItems.map((item, i) => (
                  <li key={i}>{linkify(item)}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedSummary.risks.length > 0 && (
            <div className="ai-section">
              <h6>Risks / Blockers</h6>
              <ul>
                {parsedSummary.risks.map((risk, i) => (
                  <li key={i}>{linkify(risk)}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedSummary.openQuestions.length > 0 && (
            <div className="ai-section">
              <h6>Open Questions</h6>
              <ul>
                {parsedSummary.openQuestions.map((question, i) => (
                  <li key={i}>{linkify(question)}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedSummary.timeSpent && (
            <div className="ai-section">
              <h6>Time Spent</h6>
              <p>
                {parsedSummary.timeSpent.totalHours.toFixed(2)}h across {parsedSummary.timeSpent.entryCount} entries
              </p>
              {parsedSummary.timeSpent.byActivity.length > 0 && (
                <ul>
                  {parsedSummary.timeSpent.byActivity.map((item, i) => (
                    <li key={`activity-${i}`}>{item.name}: {item.hours.toFixed(2)}h</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {parsedSummary.timeline.length > 0 && (
            <div className="ai-section">
              <h6>Recent Timeline</h6>
              <ul>
                {parsedSummary.timeline.map((entry, i) => (
                  <li key={`timeline-${i}`}>
                    {entry.at ? `[${entry.at}] ` : ""}
                    {entry.author ? `${entry.author} • ` : ""}
                    {entry.type}: {linkify(entry.detail)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsedSummary.attachments.length > 0 && (
            <div className="ai-section">
              <h6>Attachments Mentioned</h6>
              <ul>
                {parsedSummary.attachments.map((attachment, i) => (
                  <li key={`attachment-${i}`}>
                    {attachment.filename} ({attachment.type}, {attachment.sizeKb} KB)
                    {attachment.note ? ` - ${attachment.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {perfMetrics && (perfMetrics.totalDuration || perfMetrics.evalCount) && (
            <div className="ai-section ai-perf-metrics">
              <h6>Performance</h6>
              <div className="ai-perf-grid">
                {perfMetrics.totalDuration && (
                  <span className="ai-perf-badge">
                    Total: {formatDuration(perfMetrics.totalDuration)}
                  </span>
                )}
                {perfMetrics.loadDuration && (
                  <span className="ai-perf-badge">
                    Load: {formatDuration(perfMetrics.loadDuration)}
                  </span>
                )}
                {perfMetrics.promptEvalCount != null && (
                  <span className="ai-perf-badge">
                    Prompt tokens: {perfMetrics.promptEvalCount}
                  </span>
                )}
                {perfMetrics.promptEvalDuration && (
                  <span className="ai-perf-badge">
                    Prompt: {formatDuration(perfMetrics.promptEvalDuration)}
                  </span>
                )}
                {perfMetrics.evalCount != null && (
                  <span className="ai-perf-badge">
                    Tokens: {perfMetrics.evalCount}
                  </span>
                )}
                {perfMetrics.evalDuration && (
                  <span className="ai-perf-badge">
                    Gen: {formatDuration(perfMetrics.evalDuration)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {category && (
        <div className="ai-result">
          <h5>Suggested Category</h5>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85em" }}>{category}</pre>
        </div>
      )}

      <style jsx>{`
        .ai-issue-actions {
          padding: 1rem;
          background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
          border-radius: 8px;
          margin: 1rem 0;
        }

        .ai-actions-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .ai-actions-header h4 {
          margin: 0;
          font-size: 0.95rem;
        }

        .ai-powered-by {
          font-size: 0.75rem;
          color: #666;
        }

        .ai-buttons-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .ai-error {
          color: #dc2626;
          font-size: 0.85rem;
          margin: 0.5rem 0 0 0;
        }

        .ai-result {
          margin-top: 0.75rem;
          padding: 0.75rem;
          background: white;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        }

        .ai-result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .ai-result-header h5 {
          margin: 0;
          font-size: 0.85rem;
          color: #374151;
        }

        .ai-confidence {
          font-size: 0.7rem;
          color: #6b7280;
          background: #f3f4f6;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }

        .ai-section {
          margin-top: 0.75rem;
        }

        .ai-section h6 {
          margin: 0 0 0.4rem 0;
          font-size: 0.8rem;
          color: #4b5563;
          font-weight: 600;
        }

        .ai-section p {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.5;
          color: #1f2937;
        }

        .ai-section ul {
          margin: 0;
          padding-left: 1.2rem;
          font-size: 0.85rem;
          line-height: 1.6;
          color: #374151;
        }

        .ai-section ul li {
          margin-bottom: 0.25rem;
        }

        .action-items {
          list-style-type: square;
        }

        .ai-link {
          color: #2563eb;
          text-decoration: underline;
        }

        .ai-link:hover {
          color: #1d4ed8;
        }

        .ai-perf-metrics {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px dashed #e5e7eb;
        }

        .ai-perf-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .ai-perf-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 0.72rem;
          font-weight: 500;
          color: #6b7280;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
