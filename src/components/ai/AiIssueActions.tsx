"use client";

import { useState } from "react";
import { AiButton } from "./AiButton";
import { AiLoading } from "./AiLoading";

interface AiIssueActionsProps {
  issueId: string;
  onSummary?: (summary: string) => void;
  onCategory?: (category: string) => void;
}

export function AiIssueActions({ issueId, onSummary, onCategory }: AiIssueActionsProps) {
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {summary && (
        <div className="ai-result">
          <h5>Summary</h5>
          <p>{summary}</p>
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
        
        .ai-result h5 {
          margin: 0 0 0.5rem 0;
          font-size: 0.85rem;
          color: #374151;
        }
        
        .ai-result p {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
