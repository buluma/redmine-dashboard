"use client";

import { useState } from "react";
import { AiLoading } from "./AiLoading";

interface AiSearchResult {
  issueId: string;
  relevance: number;
  explanation: string;
  issue?: {
    id: string;
    redmineIssueId: number;
    subject: string;
    statusName: string;
    projectName: string | null;
  };
}

interface AiSearchBarProps {
  onResults?: (results: AiSearchResult[]) => void;
  onInsights?: (insights: string) => void;
}

export function AiSearchBar({ onResults, onInsights }: AiSearchBarProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AiSearchResult[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Search failed");
      }
      setResults(data.results || []);
      setInsights(data.insights || null);
      onResults?.(data.results);
      onInsights?.(data.insights);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-search">
      <div className="ai-search-header">
        <span className="ai-search-icon">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask AI to find relevant issues..."
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="ai-search-input"
        />
        <button onClick={handleSearch} disabled={loading || !query.trim()} className="ai-search-btn">
          {loading ? "..." : "Search"}
        </button>
      </div>

      {loading && <AiLoading message="AI is searching..." size="sm" />}

      {error && <p className="ai-search-error">{error}</p>}

      {insights && (
        <div className="ai-insights">
          <h5>💡 AI Insights</h5>
          <p>{insights}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="ai-results">
          <h5>🎯 Results</h5>
          {results.map((result, idx) => (
            <div key={result.issueId || idx} className="ai-result-item">
              <div className="ai-result-header">
                {result.issue ? (
                  <span className="ai-result-id">#{result.issue.redmineIssueId}</span>
                ) : (
                  <span className="ai-result-id">{result.issueId.slice(0, 8)}...</span>
                )}
                <span className="ai-relevance">{(result.relevance * 100).toFixed(0)}% match</span>
              </div>
              {result.issue && (
                <p className="ai-result-subject">{result.issue.subject}</p>
              )}
              <p className="ai-result-explanation">{result.explanation}</p>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .ai-search {
          margin: 1rem 0;
        }
        
        .ai-search-header {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        
        .ai-search-icon {
          font-size: 1.2rem;
        }
        
        .ai-search-input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.9rem;
        }
        
        .ai-search-input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }
        
        .ai-search-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .ai-search-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .ai-search-error {
          color: #dc2626;
          font-size: 0.85rem;
          margin: 0.5rem 0;
        }
        
        .ai-insights {
          margin-top: 1rem;
          padding: 0.75rem;
          background: linear-gradient(135deg, #667eea10 0%, #764ba210 100%);
          border-radius: 6px;
          border-left: 3px solid #667eea;
        }
        
        .ai-insights h5 {
          margin: 0 0 0.5rem 0;
          font-size: 0.85rem;
        }
        
        .ai-insights p {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        
        .ai-results {
          margin-top: 1rem;
        }
        
        .ai-results h5 {
          margin: 0 0 0.75rem 0;
          font-size: 0.9rem;
        }
        
        .ai-result-item {
          padding: 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          margin-bottom: 0.5rem;
        }
        
        .ai-result-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.25rem;
        }
        
        .ai-result-id {
          font-weight: 600;
          color: #374151;
        }
        
        .ai-relevance {
          font-size: 0.8rem;
          color: #667eea;
          font-weight: 500;
        }
        
        .ai-result-subject {
          margin: 0.25rem 0;
          font-size: 0.9rem;
        }
        
        .ai-result-explanation {
          margin: 0;
          font-size: 0.85rem;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
