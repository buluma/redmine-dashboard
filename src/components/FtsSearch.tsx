"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface SearchResult {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  statusName: string;
  assignedToName: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  source: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface FtsSearchProps {
  onSelect?: (result: SearchResult) => void;
}

export function FtsSearch({ onSelect }: FtsSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setTotal(0);
      setIsOpen(false);
      return;
    }

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=10`);
        if (res.ok) {
          const data: SearchResponse = await res.json();
          setResults(data.results);
          setTotal(data.total);
          setIsOpen(data.results.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    if (onSelect) {
      onSelect(result);
    } else {
      // Default: navigate to issue detail page using the id (not redmineIssueId)
      router.push(`/issues/${result.id}`);
    }
    setIsOpen(false);
    setQuery("");
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("closed") || s.includes("done") || s.includes("resolved")) return "sync-success";
    if (s.includes("block") || s.includes("hold") || s.includes("waiting")) return "sync-failed";
    if (s.includes("progress") || s.includes("feedback")) return "status-chip";
    return "";
  };

  return (
    <div className="fts-search">
      <div className="fts-search-input-wrap">
        <input
          type="text"
          placeholder="Search issues..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          className="fts-search-input"
        />
        {loading && <span className="fts-search-spinner">⟳</span>}
      </div>

      {isOpen && results.length > 0 && (
        <div className="fts-search-dropdown">
          <div className="fts-search-header">
            <span>{total} result{total !== 1 ? "s" : ""} found</span>
            <span className="fts-search-badge">Full-text Search</span>
          </div>
          <ul className="fts-search-results">
            {results.map((result) => (
              <li
                key={result.id}
                className="fts-search-result"
                onClick={() => handleSelect(result)}
              >
                <div className="fts-result-main">
                  <span className="fts-result-id">
                    {result.redmineIssueId ? `#${result.redmineIssueId}` : result.source}
                  </span>
                  <span className="fts-result-subject">{result.subject}</span>
                </div>
                <div className="fts-result-meta">
                  {result.projectName && <span className="meta-project">{result.projectName}</span>}
                  <span className={`meta-status ${getStatusColor(result.statusName)}`}>
                    {result.statusName}
                  </span>
                  {result.assignedToName && (
                    <span className="meta-assignee">→ {result.assignedToName}</span>
                  )}
                  {result.dueDate && (
                    <span className="meta-due">📅 {new Date(result.dueDate).toLocaleDateString("en-GB")}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div className="fts-search-dropdown">
          <div className="fts-search-empty">No results found for &ldquo;{query}&rdquo;</div>
        </div>
      )}

      <style jsx>{`
        .fts-search {
          position: relative;
        }
        .fts-search-input-wrap {
          position: relative;
        }
        .fts-search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
          color: var(--text-primary);
        }
        .fts-search-input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .fts-search-spinner {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: translateY(-50%) rotate(0deg); }
          to { transform: translateY(-50%) rotate(360deg); }
        }
        .fts-search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          margin-top: 4px;
          max-height: 400px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .fts-search-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color);
          font-size: 12px;
          color: var(--text-muted);
        }
        .fts-search-badge {
          background: var(--accent);
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
        }
        .fts-search-results {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .fts-search-result {
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-color);
        }
        .fts-search-result:last-child {
          border-bottom: none;
        }
        .fts-search-result:hover {
          background: var(--surface-2);
        }
        .fts-result-main {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .fts-result-id {
          font-size: 11px;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 2px 6px;
          border-radius: 3px;
        }
        .fts-result-subject {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .fts-result-meta {
          display: flex;
          gap: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .meta-project {
          max-width: 100px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .meta-status {
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 11px;
        }
        .meta-status.sync-success {
          background: #d4edda;
          color: #155724;
        }
        .meta-status.sync-failed {
          background: #f8d7da;
          color: #721c24;
        }
        .meta-status.status-chip {
          background: #d1ecf1;
          color: #0c5460;
        }
        .fts-search-empty {
          padding: 20px;
          text-align: center;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
