"use client";

import { useEffect, useMemo } from "react";

interface StreamingResponseProps {
  content: string;
  isStreaming?: boolean;
  modelUsed?: string;
  onDone?: () => void;
}

export function StreamingResponse({
  content,
  isStreaming = false,
  modelUsed,
  onDone,
}: StreamingResponseProps) {
  const displayedContent = useMemo(() => content, [content]);

  useEffect(() => {
    if (!isStreaming && onDone) {
      onDone();
    }
  }, [isStreaming, onDone]);

  return (
    <div className="relative">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700">
          {displayedContent}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
          )}
        </pre>
      </div>
      {modelUsed && (
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Powered by {modelUsed}
          {isStreaming && " (streaming)"}
        </div>
      )}
    </div>
  );
}

interface JsonStreamingResponseProps {
  content: string;
  isStreaming?: boolean;
  modelUsed?: string;
}

export function JsonStreamingResponse({
  content,
  isStreaming = false,
  modelUsed,
}: JsonStreamingResponseProps) {
  const { displayedContent, error } = useMemo(() => {
    try {
      if (content) {
        // Try to parse and pretty-print
        const parsed = JSON.parse(content);
        return {
          displayedContent: JSON.stringify(parsed, null, 2),
          error: null as string | null,
        };
      }
    } catch {
      // Not valid JSON yet, show raw content
      return {
        displayedContent: content,
        error: content.includes("}") ? null : "incomplete-json",
      };
    }
    return { displayedContent: "", error: null as string | null };
  }, [content]);

  return (
    <div className="relative">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <pre
          className={`whitespace-pre-wrap font-sans text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded-md border ${
            error ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-gray-700"
          }`}
        >
          {displayedContent}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-blue-500 animate-pulse" />
          )}
        </pre>
      </div>
      {modelUsed && (
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Powered by {modelUsed}
        </div>
      )}
    </div>
  );
}
