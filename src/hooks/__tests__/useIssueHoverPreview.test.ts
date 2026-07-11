import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { useIssueHoverPreview } from "@/src/hooks/useIssueHoverPreview";
import type { Issue } from "@/src/types/dashboard";

const issue = { id: 1, subject: "Test issue" } as unknown as Issue;

function makeAnchor(rect: Partial<DOMRect>) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
    ...rect,
  });
  return el;
}

describe("useIssueHoverPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no hovered issue", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    expect(result.current.hoveredIssue).toBeNull();
    expect(result.current.previewPosition).toEqual({ x: 0, y: 0 });
  });

  it("shows the issue after the 300ms delay, anchored right of the row", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    const anchor = makeAnchor({ top: 100, left: 50, right: 200 });

    act(() => {
      result.current.scheduleHoverPreview(issue, anchor);
    });
    expect(result.current.hoveredIssue).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredIssue).toBe(issue);
    expect(result.current.previewPosition.x).toBe(208); // right + 8
  });

  it("cancelling before the delay elapses never shows the issue", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    const anchor = makeAnchor({ top: 100, left: 50, right: 200 });

    act(() => {
      result.current.scheduleHoverPreview(issue, anchor);
      result.current.cancelHoverPreview();
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredIssue).toBeNull();
  });

  it("cancelling after the issue is shown hides it again", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    const anchor = makeAnchor({ top: 100, left: 50, right: 200 });

    act(() => {
      result.current.scheduleHoverPreview(issue, anchor);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredIssue).toBe(issue);

    act(() => {
      result.current.cancelHoverPreview();
    });
    expect(result.current.hoveredIssue).toBeNull();
  });

  it("flips to the left of the anchor when the tooltip would overflow the viewport", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    const anchor = makeAnchor({ top: 100, left: 400, right: 480 });

    act(() => {
      result.current.scheduleHoverPreview(issue, anchor);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.previewPosition.x).toBe(400 - 360 - 8); // left - TOOLTIP_WIDTH - 8

    Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true });
  });

  it("rescheduling cancels the previous pending timer", () => {
    const { result } = renderHook(() => useIssueHoverPreview());
    const anchorA = makeAnchor({ top: 0, left: 0, right: 100 });
    const anchorB = makeAnchor({ top: 0, left: 0, right: 300 });
    const issueB = { id: 2, subject: "Other issue" } as unknown as Issue;

    act(() => {
      result.current.scheduleHoverPreview(issue, anchorA);
      vi.advanceTimersByTime(100);
      result.current.scheduleHoverPreview(issueB, anchorB);
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredIssue).toBe(issueB);
  });

  it("clears a pending timer on unmount without throwing", () => {
    const { result, unmount } = renderHook(() => useIssueHoverPreview());
    const anchor = makeAnchor({ top: 0, left: 0, right: 100 });

    act(() => {
      result.current.scheduleHoverPreview(issue, anchor);
    });
    expect(() => unmount()).not.toThrow();
  });
});
