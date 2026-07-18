import { describe, expect, it } from "vitest";
import { isLocalOnlyIssue, isHybridLocalMirror } from "@/src/lib/issue-shape";

describe("isLocalOnlyIssue", () => {
  it("is true for a genuinely local-only issue (no real Redmine ticket)", () => {
    expect(isLocalOnlyIssue({ source: "local", redmineIssueId: null })).toBe(true);
  });

  it("is false for a normal Redmine-sourced issue", () => {
    expect(isLocalOnlyIssue({ source: "redmine", redmineIssueId: 12345 })).toBe(false);
  });

  it("is false for a recurring-tickets hybrid mirror (source:local WITH a real redmineIssueId)", () => {
    // This is the exact case that was silently discarding edits: source is
    // "local" (required for correlation.ts's WakaTime matching) but the
    // ticket also has a real Redmine id it needs edits pushed to.
    expect(isLocalOnlyIssue({ source: "local", redmineIssueId: 115882 })).toBe(false);
  });

  it("is false even if source is unexpectedly something else entirely, as long as a redmineIssueId is present", () => {
    expect(isLocalOnlyIssue({ source: "redmine", redmineIssueId: 1 })).toBe(false);
  });
});

describe("isHybridLocalMirror", () => {
  it("is true for a recurring-tickets hybrid mirror (source:local WITH a real redmineIssueId)", () => {
    expect(isHybridLocalMirror({ source: "local", redmineIssueId: 115882 })).toBe(true);
  });

  it("is false for a genuinely local-only issue (no Redmine ticket)", () => {
    expect(isHybridLocalMirror({ source: "local", redmineIssueId: null })).toBe(false);
  });

  it("is false for a normal Redmine-sourced issue", () => {
    expect(isHybridLocalMirror({ source: "redmine", redmineIssueId: 12345 })).toBe(false);
  });

  it("is the exact complement of isLocalOnlyIssue among source:local rows", () => {
    const localOnly = { source: "local", redmineIssueId: null };
    const hybrid = { source: "local", redmineIssueId: 1 };
    expect(isLocalOnlyIssue(localOnly)).toBe(true);
    expect(isHybridLocalMirror(localOnly)).toBe(false);
    expect(isLocalOnlyIssue(hybrid)).toBe(false);
    expect(isHybridLocalMirror(hybrid)).toBe(true);
  });
});
