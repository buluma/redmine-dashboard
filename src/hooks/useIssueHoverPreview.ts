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
      const rect = anchor.getBoundingClientRect();
      let left = rect.right + 8;
      if (left + TOOLTIP_WIDTH + MARGIN > window.innerWidth) {
        left = Math.max(MARGIN, rect.left - TOOLTIP_WIDTH - 8);
      }
      const top = Math.min(
        Math.max(MARGIN, rect.top),
        window.innerHeight - 200,
      );
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
