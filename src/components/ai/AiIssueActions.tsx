"use client";

import { useMemo, useState } from "react";
import { AiButton } from "./AiButton";
import { AiLoading } from "./AiLoading";

interface StoredSummary {
  id: string;
  summary: string;
  model: string;
  createdAt: string;
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
    // If not JSON, treat as plain text summary
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

  const parsedSummary = useMemo(() => parseSummaryText(summary), [summary]);

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
      setSummary(data.summary);
      onSummary?.(data.summary);
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
        <span className="ai-powered-by">Powered by Ollama</span>
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
      `}</style>
    </div>
  );
}
