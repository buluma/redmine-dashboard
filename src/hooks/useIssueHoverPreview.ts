"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Issue } from "@/src/types/dashboard";

export interface HoverPreviewPosition {
  x: number;
  y: number;
}

export interface UseIssueHoverPreviewResult {
  hoveredIssue: Issue | null;
  previewPosition: HoverPreviewPosition;
  scheduleHoverPreview: (issue: Issue, anchor: HTMLElement) => void;
  cancelHoverPreview: () => void;
}

const HOVER_DELAY_MS = 300;
const TOOLTIP_WIDTH = 360;
const TOOLTIP_EST_HEIGHT = 200;
const MARGIN = 12;

export function useIssueHoverPreview(): UseIssueHoverPreviewResult {
  const [hoveredIssue, setHoveredIssue] = useState<Issue | null>(null);
  const [previewPosition, setPreviewPosition] = useState<HoverPreviewPosition>({ x: 0, y: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHoverPreview = useCallback((issue: Issue, anchor: HTMLElement) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      // The anchor is the subject cell of a table row — anything to its
      // right (status/priority/due/...) is still part of that same row, so
      // anchoring the tooltip there sits it right on top of the very fields
      // it's summarizing. Anchor below the row instead; flip above it if
      // there isn't room underneath.
      const rect = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(MARGIN, rect.left),
        window.innerWidth - TOOLTIP_WIDTH - MARGIN,
      );
      const top =
        rect.bottom + TOOLTIP_EST_HEIGHT + 8 > window.innerHeight
          ? Math.max(MARGIN, rect.top - TOOLTIP_EST_HEIGHT - 8)
          : rect.bottom + 8;
      setPreviewPosition({ x: left, y: top });
      setHoveredIssue(issue);
    }, HOVER_DELAY_MS);
  }, []);

  const cancelHoverPreview = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredIssue(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return { hoveredIssue, previewPosition, scheduleHoverPreview, cancelHoverPreview };
}
