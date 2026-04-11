"use client";

import { useState, useEffect, useRef } from "react";

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
  const [displayedContent, setDisplayedContent] = useState("");
  const [isDone, setIsDone] = useState(!isStreaming);
  const contentRef = useRef(content);

  useEffect(() => {
    if (isStreaming && content !== contentRef.current) {
      // Streaming mode - gradually reveal content
      const newChars = content.slice(contentRef.current.length);
      if (newChars.length > 0) {
        setDisplayedContent(content);
        contentRef.current = content;
      }
    } else if (!isStreaming) {
      // Non-streaming - show all at once
      setDisplayedContent(content);
      setIsDone(true);
    }
  }, [content, isStreaming]);

  useEffect(() => {
    if (isDone && onDone) {
      onDone();
    }
  }, [isDone, onDone]);

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
  const [displayedContent, setDisplayedContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (content) {
        // Try to parse and pretty-print
        const parsed = JSON.parse(content);
        setDisplayedContent(JSON.stringify(parsed, null, 2));
        setError(null);
      }
    } catch {
      // Not valid JSON yet, show raw content
      setDisplayedContent(content);
      if (content.includes("}")) {
        setError(null); // Likely still typing
      }
    }
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
