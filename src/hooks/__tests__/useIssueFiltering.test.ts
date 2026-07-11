import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIssueFiltering } from "@/src/hooks/useIssueFiltering";
import type { FilterState } from "@/src/components/AdvancedFilters";
import type { Issue } from "@/src/types/dashboard";

const NO_ADVANCED_FILTERS: FilterState = {
  search: "",
  statusIds: [],
  priorityIds: [],
  assignedToMe: false,
  hasGithubLinks: false,
  hasAttachments: false,
};

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "1",
    redmineIssueId: 1,
    localIssueNumber: null,
    redmineBaseUrl: "https://redmine.example.com",
    subject: "Test issue",
    description: null,
    projectName: "Core",
    parentIssueId: null,
    parentIssueLabel: null,
    tracker: "Bug",
    priority: "Normal",
    priorityId: 2,
    priorityName: "Normal",
    statusId: 1,
    statusName: "New",
    assignedToName: null,
    updatedAt: "2026-07-01T00:00:00Z",
    updatedOnRemote: "2026-07-01T00:00:00Z",
    lastActivityAt: "2026-07-01T00:00:00Z",
    lastActivityType: "issue_update",
    dueDate: null,
    startDate: null,
    estimatedHours: null,
    createdAt: "2026-06-01T00:00:00Z",
    doneRatio: 0,
    githubLinks: [],
    journals: [],
    timeEntries: [],
    attachments: [],
    relations: [],
    allowedStatuses: [],
    children: [],
    ...overrides,
  };
}

function renderFiltering(overrides: Partial<Parameters<typeof useIssueFiltering>[0]> = {}) {
  const params = {
    issues: [],
    total: 0,
    priorities: [],
    selectedProject: null,
    advancedFilters: NO_ADVANCED_FILTERS,
    showFavoritesOnly: false,
    favoriteIssueIds: [],
    statusFilter: "",
    selectedIssueIds: [],
    ...overrides,
  };
  return renderHook(() => useIssueFiltering(params));
}

describe("useIssueFiltering", () => {
  describe("computedPriorityOptions", () => {
    it("derives priority options from issues when present", () => {
      const issues = [
        makeIssue({ id: "1", priorityId: 3, priorityName: "High" }),
        makeIssue({ id: "2", priorityId: 1, priorityName: "Low" }),
      ];
      const { result } = renderFiltering({ issues });
      expect(result.current.computedPriorityOptions).toEqual([
        { id: 3, name: "High" },
        { id: 1, name: "Low" },
      ]);
    });

    it("falls back to the priorities string list when no issue has a priorityId", () => {
      const { result } = renderFiltering({ issues: [], priorities: ["Low", "Normal", "High"] });
      expect(result.current.computedPriorityOptions).toEqual([
        { id: 1, name: "Low" },
        { id: 2, name: "Normal" },
        { id: 3, name: "High" },
      ]);
    });
  });

  describe("filtering pipeline", () => {
    it("filters by selectedProject", () => {
      const issues = [
        makeIssue({ id: "1", projectName: "Core" }),
        makeIssue({ id: "2", projectName: "Web" }),
      ];
      const { result } = renderFiltering({ issues, selectedProject: "Web" });
      expect(result.current.baseFilteredIssues.map((i) => i.id)).toEqual(["2"]);
    });

    it("filters by showFavoritesOnly against favoriteIssueIds", () => {
      const issues = [
        makeIssue({ id: "1", redmineIssueId: 10 }),
        makeIssue({ id: "2", redmineIssueId: 20 }),
      ];
      const { result } = renderFiltering({ issues, showFavoritesOnly: true, favoriteIssueIds: [20] });
      expect(result.current.baseFilteredIssues.map((i) => i.id)).toEqual(["2"]);
    });

    it("applies the Open quick-status filter", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "New" }),
        makeIssue({ id: "2", statusName: "Closed" }),
      ];
      const { result } = renderFiltering({ issues, statusFilter: "Open" });
      expect(result.current.visibleIssues.map((i) => i.id)).toEqual(["1"]);
    });

    it("applies the Blocked quick-status filter", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "Blocked" }),
        makeIssue({ id: "2", statusName: "New" }),
      ];
      const { result } = renderFiltering({ issues, statusFilter: "Blocked" });
      expect(result.current.visibleIssues.map((i) => i.id)).toEqual(["1"]);
    });

    it("applies the Overdue quick-status filter", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "New", dueDate: "2020-01-01T00:00:00Z" }),
        makeIssue({ id: "2", statusName: "New", dueDate: null }),
      ];
      const { result } = renderFiltering({ issues, statusFilter: "Overdue" });
      expect(result.current.visibleIssues.map((i) => i.id)).toEqual(["1"]);
    });

    it("applies an exact statusName filter for any other value", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "In Progress" }),
        makeIssue({ id: "2", statusName: "New" }),
      ];
      const { result } = renderFiltering({ issues, statusFilter: "In Progress" });
      expect(result.current.visibleIssues.map((i) => i.id)).toEqual(["1"]);
    });

    it("passes everything through when statusFilter is empty", () => {
      const issues = [makeIssue({ id: "1" }), makeIssue({ id: "2" })];
      const { result } = renderFiltering({ issues });
      expect(result.current.visibleIssues).toHaveLength(2);
    });
  });

  describe("allVisibleIssueIds / selectedAllVisible", () => {
    it("collects numeric redmineIssueId for every visible issue", () => {
      const issues = [
        makeIssue({ id: "1", redmineIssueId: 10 }),
        makeIssue({ id: "2", redmineIssueId: null }),
        makeIssue({ id: "3", redmineIssueId: 30 }),
      ];
      const { result } = renderFiltering({ issues });
      expect(result.current.allVisibleIssueIds).toEqual([10, 30]);
    });

    it("is true only when every visible id is selected", () => {
      const issues = [
        makeIssue({ id: "1", redmineIssueId: 10 }),
        makeIssue({ id: "2", redmineIssueId: 20 }),
      ];
      const partial = renderFiltering({ issues, selectedIssueIds: [10] });
      expect(partial.result.current.selectedAllVisible).toBe(false);

      const full = renderFiltering({ issues, selectedIssueIds: [10, 20] });
      expect(full.result.current.selectedAllVisible).toBe(true);
    });

    it("is false when there are no visible issues", () => {
      const { result } = renderFiltering({ issues: [] });
      expect(result.current.selectedAllVisible).toBe(false);
    });
  });

  describe("summary", () => {
    it("counts open/blocked/overdue/done buckets", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "New", dueDate: "2099-01-01T00:00:00Z" }),
        makeIssue({ id: "2", statusName: "Blocked" }),
        makeIssue({ id: "3", statusName: "New", dueDate: "2020-01-01T00:00:00Z" }),
        makeIssue({ id: "4", statusName: "Closed" }),
      ];
      const { result } = renderFiltering({ issues, total: 4 });
      const s = result.current.summary;
      expect(s.totalVisible).toBe(4);
      expect(s.total).toBe(4);
      expect(s.blocked).toBe(1);
      expect(s.overdue).toBe(1);
      expect(s.done).toBe(1);
    });

    it("ranks atRisk by severity, overdue+blocked above plain stale", () => {
      const issues = [
        makeIssue({
          id: "stale-only",
          statusName: "New",
          lastActivityAt: "2000-01-01T00:00:00Z",
          updatedOnRemote: "2000-01-01T00:00:00Z",
        }),
        makeIssue({
          id: "overdue-and-blocked",
          statusName: "Blocked",
          dueDate: "2000-01-01T00:00:00Z",
        }),
      ];
      const { result } = renderFiltering({ issues });
      const atRisk = result.current.summary.atRisk;
      expect(atRisk[0].issue.id).toBe("overdue-and-blocked");
      expect(atRisk[0].reason).toContain("overdue");
      expect(atRisk[0].reason).toContain("blocked");
    });

    it("builds recentActivity from issue updates, journals, and time entries, newest first", () => {
      const issues = [
        makeIssue({
          id: "1",
          lastActivityAt: "2026-01-01T00:00:00Z",
          journals: [
            { id: "j1", author: "Alice", notes: null, details: [], createdOnRemote: "2026-03-01T00:00:00Z" },
          ],
          timeEntries: [
            { id: "t1", redmineTimeEntryId: 1, hours: 2, activityId: 1, activityName: "Dev", authorName: "Bob", comments: null, spentOn: "2026-02-01T00:00:00Z" },
          ],
        }),
      ];
      const { result } = renderFiltering({ issues });
      const activity = result.current.summary.recentActivity;
      expect(activity.length).toBe(3);
      // newest (journal, March) first
      expect(new Date(activity[0].timestamp).getTime()).toBeGreaterThan(new Date(activity[1].timestamp).getTime());
      expect(activity.some((a) => a.detail.includes("Alice commented"))).toBe(true);
      expect(activity.some((a) => a.detail.includes("2.0h logged"))).toBe(true);
    });

    it("computes completion percentage from the done bucket", () => {
      const issues = [
        makeIssue({ id: "1", statusName: "Closed" }),
        makeIssue({ id: "2", statusName: "New" }),
      ];
      const { result } = renderFiltering({ issues, total: 2 });
      expect(result.current.summary.completion).toBe(50);
    });
  });
});
