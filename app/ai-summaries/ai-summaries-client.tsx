"use client";

import Link from "next/link";
import { useState, useMemo } from "react";

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
    redmineIssueId: number | null;
    redmineBaseUrl: string | null;
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

interface FilterOptions {
  model: string;
  project: string;
  status: string;
  dateRange: "all" | "7d" | "30d" | "90d";
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

function getProviderIcon(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "🧠";
  if (m.includes("gpt") || m.includes("openai")) return "💬";
  if (m.includes("llama") || m.includes("mistral") || m.includes("qwen")) return "🦙";
  return "🤖";
}

function buildExportText(summaries: AiSummaryData[]): string {
  const lines: string[] = ["AI Summaries Export", "==================", ""];

  for (const summary of summaries) {
    const parsed = parseSummaryText(summary.summary);
    lines.push(`#${summary.issue.redmineIssueId} - ${summary.issue.subject}`);
    lines.push(`Status: ${summary.issue.statusName} | Project: ${summary.issue.projectName || "N/A"}`);
    lines.push(`Model: ${summary.model} | Date: ${formatDate(new Date(summary.updatedAt))}`);
    lines.push("");
    
    if (parsed) {
      if (parsed.summary) {
        lines.push("Summary:");
        lines.push(parsed.summary);
        lines.push("");
      }
      if (parsed.keyPoints.length > 0) {
        lines.push("Key Points:");
        parsed.keyPoints.forEach((p) => lines.push(`• ${p}`));
        lines.push("");
      }
      if (parsed.actionItems.length > 0) {
        lines.push("Action Items:");
        parsed.actionItems.forEach((a) => lines.push(`→ ${a}`));
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function CopyButton({ summary, parsed }: { summary: string; parsed: ParsedSummary }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildExportText([{ id: "", summary, model: "", updatedAt: new Date(), totalDuration: null, loadDuration: null, promptEvalCount: null, promptEvalDuration: null, evalCount: null, evalDuration: null, issue: { redmineIssueId: 0, redmineBaseUrl: "", subject: "", statusName: "", priority: null, projectName: null, assignedToName: null } }]);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  const color = percentage >= 80 ? "#10b981" : percentage >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="confidence-bar-container" title={`${percentage}% confident`}>
      <div className="confidence-bar-bg">
        <div
          className="confidence-bar-fill"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <span className="confidence-label">{percentage}%</span>
    </div>
  );
}

export function AiSummariesClient({ summaries }: { summaries: AiSummaryData[] }) {
  const [filters, setFilters] = useState<FilterOptions>({
    model: "all",
    project: "all",
    status: "all",
    dateRange: "all",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique values for filter dropdowns
  const uniqueModels = useMemo(() => [...new Set(summaries.map((s) => s.model))].sort(), [summaries]);
  const uniqueProjects = useMemo(
    () => [...new Set(summaries.map((s) => s.issue.projectName).filter(Boolean))].sort() as string[],
    [summaries]
  );
  const uniqueStatuses = useMemo(
    () => [...new Set(summaries.map((s) => s.issue.statusName))].sort(),
    [summaries]
  );

  // Apply filters
  const filteredSummaries = useMemo(() => {
    let result = [...summaries];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          s.issue.subject.toLowerCase().includes(term) ||
          (s.issue.redmineIssueId?.toString() ?? "").includes(term) ||
          s.summary.toLowerCase().includes(term)
      );
    }

    // Model filter
    if (filters.model !== "all") {
      result = result.filter((s) => s.model === filters.model);
    }

    // Project filter
    if (filters.project !== "all") {
      result = result.filter((s) => s.issue.projectName === filters.project);
    }

    // Status filter
    if (filters.status !== "all") {
      result = result.filter((s) => s.issue.statusName === filters.status);
    }

    // Date range filter
    if (filters.dateRange !== "all") {
      const now = new Date();
      const days = filters.dateRange === "7d" ? 7 : filters.dateRange === "30d" ? 30 : 90;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      result = result.filter((s) => new Date(s.updatedAt) >= cutoff);
    }

    return result;
  }, [summaries, filters, searchTerm]);

  const paginatedSummaries = useMemo(() => {
    const start = page * pageSize;
    return filteredSummaries.slice(start, start + pageSize);
  }, [filteredSummaries, page, pageSize]);

  const totalPages = Math.ceil(filteredSummaries.length / pageSize);

  const handleExport = () => {
    const text = buildExportText(filteredSummaries);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-summaries-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilters({ model: "all", project: "all", status: "all", dateRange: "all" });
    setSearchTerm("");
    setPage(0);
  };

  const hasActiveFilters =
    filters.model !== "all" ||
    filters.project !== "all" ||
    filters.status !== "all" ||
    filters.dateRange !== "all" ||
    searchTerm.trim() !== "";

  return (
    <div className="summaries-container">
      {/* Toolbar */}
      <div className="summaries-toolbar">
        <div className="summaries-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search summaries..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            className="summaries-search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="summaries-search-clear"
              onClick={() => setSearchTerm("")}
            >
              ×
            </button>
          )}
        </div>

        <div className="summaries-actions">
          <button
            type="button"
            className={`filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            🔍 Filters {hasActiveFilters && `(${filteredSummaries.length})`}
          </button>

          <button
            type="button"
            className="export-btn"
            onClick={handleExport}
            disabled={filteredSummaries.length === 0}
          >
            📥 Export ({filteredSummaries.length})
          </button>

          {hasActiveFilters && (
            <button type="button" className="clear-filters-btn" onClick={clearFilters}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Model</label>
            <select
              value={filters.model}
              onChange={(e) => {
                setFilters({ ...filters, model: e.target.value });
                setPage(0);
              }}
            >
              <option value="all">All Models</option>
              {uniqueModels.map((m) => (
                <option key={m} value={m}>
                  {getProviderIcon(m)} {m}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Project</label>
            <select
              value={filters.project}
              onChange={(e) => {
                setFilters({ ...filters, project: e.target.value });
                setPage(0);
              }}
            >
              <option value="all">All Projects</option>
              {uniqueProjects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters({ ...filters, status: e.target.value });
                setPage(0);
              }}
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <select
              value={filters.dateRange}
              onChange={(e) => {
                setFilters({ ...filters, dateRange: e.target.value as FilterOptions["dateRange"] });
                setPage(0);
              }}
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="summaries-list">
        {paginatedSummaries.length === 0 ? (
          <p className="muted" style={{ padding: "1rem 0" }}>
            {hasActiveFilters ? "No summaries match your filters." : "No summaries yet."}
          </p>
        ) : (
          paginatedSummaries.map((summary) => {
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
                    <span className="summary-model">
                      {getProviderIcon(summary.model)} {summary.model}
                    </span>
                    <span className="summary-date">{formatDate(new Date(summary.updatedAt))}</span>
                  </div>
                </div>

                {parsed && (
                  <div className="ai-result">
                    <div className="ai-result-header">
                      <h5>AI Summary</h5>
                      <div className="ai-result-actions">
                        {parsed.confidence > 0 && (
                          <ConfidenceBar confidence={parsed.confidence} />
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
                          Total Time: {formatDuration(summary.totalDuration)}
                        </span>
                      )}
                      {summary.loadDuration && (
                        <span className="summary-metric">
                          Load: {formatDuration(summary.loadDuration)}
                        </span>
                      )}
                      {summary.promptEvalCount != null && (
                        <span className="summary-metric">
                          Prompt: {summary.promptEvalCount}
                        </span>
                      )}
                      {summary.evalCount != null && (
                        <span className="summary-metric">
                          Tokens: {summary.evalCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="summaries-pagination">
          <span className="pagination-info">
            Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredSummaries.length)} of{" "}
            {filteredSummaries.length}
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
        .summaries-container {
          margin-top: 1rem;
        }

        .summaries-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .summaries-search {
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

        .summaries-search svg {
          color: #9ca3af;
          flex-shrink: 0;
        }

        .summaries-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          background: transparent;
        }

        .summaries-search-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 1.2rem;
          padding: 0;
          line-height: 1;
        }

        .summaries-search-clear:hover {
          color: #6b7280;
        }

        .summaries-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .filter-toggle {
          padding: 0.4rem 0.75rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 6px;
          background: white;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .filter-toggle:hover {
          background: #f3f4f6;
        }

        .filter-toggle.active {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
        }

        .export-btn {
          padding: 0.4rem 0.75rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 6px;
          background: white;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .export-btn:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .export-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .clear-filters-btn {
          padding: 0.4rem 0.75rem;
          border: none;
          background: none;
          font-size: 0.8rem;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
        }

        .clear-filters-btn:hover {
          color: var(--accent-strong);
        }

        .filters-panel {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          padding: 1rem;
          margin-bottom: 1rem;
          background: #f9fafb;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .filter-group label {
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 500;
        }

        .filter-group select {
          padding: 0.4rem 0.6rem;
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 4px;
          font-size: 0.8rem;
          background: white;
        }

        .summaries-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .confidence-bar-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .confidence-bar-bg {
          width: 60px;
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          overflow: hidden;
        }

        .confidence-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .confidence-label {
          font-size: 0.7rem;
          font-family: monospace;
          color: #6b7280;
          min-width: 30px;
        }

        .summaries-pagination {
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
      `}</style>
    </div>
  );
}
