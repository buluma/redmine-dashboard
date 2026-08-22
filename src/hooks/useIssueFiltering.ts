"use client";

import { useMemo } from "react";

import { applyFilters, type FilterState } from "@/src/components/AdvancedFilters";
import {
  activityDetailLabel,
  dayDiffFromNow,
  dueInDays,
  isBlockedStatus,
  isDoneStatus,
  isInProgressStatus,
  isOpenStatus,
  issueDisplayId,
  issueRouteId,
  issueUrgency,
  issueNumericId as toIssueNumericId,
  latestIssueActivityTimestamp,
} from "@/src/lib/issue-utils";
import type { ActivityEvent, Issue } from "@/src/types/dashboard";

export interface UseIssueFilteringParams {
  issues: Issue[];
  total: number;
  priorities: string[];
  selectedProject: string | null;
  advancedFilters: FilterState;
  showFavoritesOnly: boolean;
  favoriteIssueIds: number[];
  statusFilter: string;
  selectedIssueIds: number[];
}

export interface PriorityOption {
  id: number;
  name: string;
}

export interface DashboardSummary {
  totalVisible: number;
  total: number;
  open: number;
  inProgress: number;
  done: number;
  blocked: number;
  overdue: number;
  dueSoon: number;
  stale: number;
  dueToday: number;
  completion: number;
  avgDoneRatio: number;
  avgOpenAgeDays: number;
  topStatuses: [string, number][];
  priorityMix: [string, number][];
  atRisk: Array<{ issue: Issue; severity: number; reason: string }>;
  recentActivity: ActivityEvent[];
}

export interface UseIssueFilteringResult {
  computedPriorityOptions: PriorityOption[];
  baseFilteredIssues: Issue[];
  visibleIssues: Issue[];
  allVisibleIssueIds: number[];
  selectedAllVisible: boolean;
  summary: DashboardSummary;
}

export function useIssueFiltering({
  issues,
  total,
  priorities,
  selectedProject,
  advancedFilters,
  showFavoritesOnly,
  favoriteIssueIds,
  statusFilter,
  selectedIssueIds,
}: UseIssueFilteringParams): UseIssueFilteringResult {
  const computedPriorityOptions = useMemo(() => {
    const discovered = new Map<number, string>();
    for (const issue of issues) {
      if (typeof issue.priorityId === "number" && issue.priorityId > 0) {
        discovered.set(issue.priorityId, issue.priorityName ?? issue.priority ?? `Priority ${issue.priorityId}`);
      }
    }

    if (discovered.size > 0) {
      return Array.from(discovered.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }

    return priorities.map((name, index) => ({ id: index + 1, name }));
  }, [issues, priorities]);

  const baseFilteredIssues = useMemo(() => {
    let filtered = issues;

    if (selectedProject) {
      filtered = filtered.filter((issue) => issue.projectName === selectedProject);
    }

    filtered = applyFilters(filtered, advancedFilters);

    if (showFavoritesOnly) {
      filtered = filtered.filter(
        (issue) => issue.redmineIssueId !== null && favoriteIssueIds.includes(issue.redmineIssueId),
      );
    }

    return filtered;
  }, [advancedFilters, favoriteIssueIds, issues, selectedProject, showFavoritesOnly]);

  const visibleIssues = useMemo(() => {
    if (statusFilter === "Open") {
      return baseFilteredIssues.filter((issue) => isOpenStatus(issue.statusName));
    }
    if (statusFilter === "Blocked") {
      return baseFilteredIssues.filter((issue) => isBlockedStatus(issue.statusName));
    }
    if (statusFilter === "Overdue") {
      return baseFilteredIssues.filter((issue) => issueUrgency(issue) === "overdue");
    }
    if (statusFilter) {
      return baseFilteredIssues.filter((issue) => issue.statusName === statusFilter);
    }
    return baseFilteredIssues;
  }, [baseFilteredIssues, statusFilter]);

  const allVisibleIssueIds = useMemo(
    () => visibleIssues
      .map((i) => toIssueNumericId(i.redmineIssueId))
      .filter((id): id is number => id !== null),
    [visibleIssues],
  );

  const selectedAllVisible = useMemo(
    () => allVisibleIssueIds.length > 0 && allVisibleIssueIds.every((id) => selectedIssueIds.includes(id)),
    [allVisibleIssueIds, selectedIssueIds],
  );

  const summary = useMemo((): DashboardSummary => {
    const byStatus = new Map<string, number>();
    const byPriority = new Map<string, number>();
    const atRiskCandidates: Array<{ issue: Issue; severity: number; reason: string }> = [];
    const activityFeed: ActivityEvent[] = [];

    let open = 0;
    let inProgress = 0;
    let done = 0;
    let blocked = 0;
    let overdue = 0;
    let dueSoon = 0;
    let stale = 0;
    let dueToday = 0;
    let totalProgress = 0;
    let openUpdateAgeDays = 0;

    for (const issue of baseFilteredIssues) {
      byStatus.set(issue.statusName, (byStatus.get(issue.statusName) ?? 0) + 1);
      byPriority.set(issue.priority ?? "Unspecified", (byPriority.get(issue.priority ?? "Unspecified") ?? 0) + 1);

      const openState = isOpenStatus(issue.statusName);
      const blockedState = isBlockedStatus(issue.statusName);
      const urgency = issueUrgency(issue);
      const ageDays = dayDiffFromNow(latestIssueActivityTimestamp(issue));
      const daysToDue = dueInDays(issue.dueDate);

      if (openState) {
        open += 1;
        if (!blockedState) openUpdateAgeDays += ageDays;
      }
      if (isInProgressStatus(issue.statusName)) inProgress += 1;
      if (isDoneStatus(issue.statusName)) done += 1;
      if (blockedState) blocked += 1;
      if (urgency === "overdue") overdue += 1;
      if (urgency === "soon") dueSoon += 1;
      if (openState && ageDays >= 3) stale += 1;
      if (openState && daysToDue === 0) dueToday += 1;

      totalProgress += issue.doneRatio ?? 0;

      let severity = 0;
      const reasons: string[] = [];
      if (urgency === "overdue") {
        severity += 3;
        reasons.push("overdue");
      }
      if (blockedState) {
        severity += 2;
        reasons.push("blocked");
      }
      if (openState && ageDays >= 3) {
        severity += 1;
        reasons.push(`stale ${ageDays}d`);
      }
      if (severity > 0) {
        atRiskCandidates.push({ issue, severity, reason: reasons.join(" + ") });
      }

      activityFeed.push({
        issueId: issueRouteId(issue),
        issueLabel: issueDisplayId(issue),
        issueSubject: issue.subject,
        timestamp: latestIssueActivityTimestamp(issue),
        detail: `Latest activity: ${activityDetailLabel(issue)}`,
      });

      for (const journal of issue.journals.slice(0, 3)) {
        activityFeed.push({
          issueId: issueRouteId(issue),
          issueLabel: issueDisplayId(issue),
          issueSubject: issue.subject,
          timestamp: journal.createdOnRemote,
          detail: `${journal.author ?? "Unknown"} commented`,
        });
      }

      for (const entry of issue.timeEntries.slice(0, 2)) {
        activityFeed.push({
          issueId: issueRouteId(issue),
          issueLabel: issueDisplayId(issue),
          issueSubject: issue.subject,
          timestamp: entry.spentOn,
          detail: `${entry.hours.toFixed(1)}h logged${entry.activityName ? ` (${entry.activityName})` : ""}`,
        });
      }
    }

    const topStatuses = Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const priorityMix = Array.from(byPriority.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const count = baseFilteredIssues.length || 1;
    const completion = Math.round((done / count) * 100);
    const avgDoneRatio = Math.round(totalProgress / count);

    const atRisk = atRiskCandidates
      .sort((a, b) => {
        if (b.severity !== a.severity) return b.severity - a.severity;
        return new Date(latestIssueActivityTimestamp(a.issue)).getTime() - new Date(latestIssueActivityTimestamp(b.issue)).getTime();
      })
      .slice(0, 7);

    const recentActivity = activityFeed
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);

    return {
      totalVisible: baseFilteredIssues.length,
      total,
      open,
      inProgress,
      done,
      blocked,
      overdue,
      dueSoon,
      stale,
      dueToday,
      completion,
      avgDoneRatio,
      avgOpenAgeDays: (open - blocked) > 0 ? Math.round(openUpdateAgeDays / (open - blocked)) : 0,
      topStatuses,
      priorityMix,
      atRisk,
      recentActivity,
    };
  }, [total, baseFilteredIssues]);

  return {
    computedPriorityOptions,
    baseFilteredIssues,
    visibleIssues,
    allVisibleIssueIds,
    selectedAllVisible,
    summary,
  };
}
