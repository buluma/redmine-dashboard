"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeRedmineText } from "@/src/lib/redmine-text-format";
import { AllowedStatusView } from "@/src/lib/issue-shape";
import type { Attachment, Journal, TimeEntry } from "@/src/types/dashboard";

export type GithubLink = {
  id: string;
  repositoryFullName: string;
  githubIssueNumber: number | null;
  githubPrNumber: number | null;
  url: string;
  title: string | null;
  createdAt: string;
};

export type Relation = {
  id: string;
  redmineRelationId: number;
  targetIssueId: number;
  relationType: string;
  delay: number | null;
};

export type IssueChild = {
  id: number;
  subject: string;
  tracker?: string | null;
  statusName?: string | null;
  assignedToName?: string | null;
};

export type Issue = {
  id: string;
  redmineIssueId: number | null;
  redmineBaseUrl: string | null;
  source: string;
  localIssueNumber: number | null;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  authorName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  startDate: string | null;
  estimatedHours: number | null;
  spentHours: number | null;
  customFieldsJson: Array<{
    id: number;
    name: string;
    value: string | null;
  }> | null;
  breadcrumbs: Array<{ id: number; subject: string; tracker?: string; isCached?: boolean }>;
  updatedOnRemote: string;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  githubLinks: GithubLink[];
  journals: Journal[];
  timeEntries: TimeEntry[];
  attachments: Attachment[];
  relations: Relation[];
  allowedStatuses: AllowedStatusView[];
  children: IssueChild[];
};

const ATTACHMENT_MARKER_RE = /\/api\/issues\/_ATTACHMENT_\/([^)]+)/gi;

function normalizeAttachmentFilename(value: string): string {
  const decoded = decodeURIComponent(value).trim();
  const baseName = decoded.split("/").pop() ?? decoded;
  return baseName.toLowerCase();
}

function extractAttachmentRefsFromText(content: string): string[] {
  const refs: string[] = [];
  const normalized = normalizeRedmineText(content);
  ATTACHMENT_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = ATTACHMENT_MARKER_RE.exec(normalized)) !== null) {
    if (match[1]) {
      refs.push(decodeURIComponent(match[1]));
    }
  }
  return refs;
}

export interface UseIssueDetailResult {
  issue: Issue | null;
  setIssue: (updater: Issue | null | ((current: Issue | null) => Issue | null)) => void;
  loading: boolean;
  error: string | null;
  reloadIssue: () => Promise<void>;
  refreshIssueFromRedmine: () => Promise<void>;
  refreshBusy: boolean;
  aiStatus: { available: boolean } | null;
  transitionStatuses: AllowedStatusView[];
  activities: Array<{ id: number; name: string }>;
  users: Array<{ id: number; name: string }>;
  priorities: Array<{ id: number; name: string; isDefault: boolean }>;
  customFieldDefs: Array<{
    id: number;
    name: string;
    fieldFormat: string;
    possibleValues: Array<{ value: string }> | null;
    required: boolean;
  }>;
  isFavorited: boolean;
  toggleFavorite: () => Promise<void>;
  hydratedRelatedIds: Set<number>;
}

/**
 * Owns every fetch and background sync effect the issue-detail page needs:
 * the issue itself, its live/allowed statuses, the assignable-user/priority/
 * activity/custom-field lookups, favorite state, a best-effort attachment
 * refresh when the description/journals reference an attachment the cache
 * doesn't have yet, and a low-priority prefetch of related (breadcrumb/
 * child) issues so their titles render without a network round trip when
 * the user actually navigates to one.
 */
export function useIssueDetail(
  issueId: string,
  t: (key: string, variables?: Record<string, string | number> | string) => string,
): UseIssueDetailResult {
  const [snapshot, setSnapshot] = useState<{ key: string; issue: Issue | null; error: string | null } | null>(null);
  const validId = Boolean(issueId.trim());
  const issue = snapshot?.key === issueId ? snapshot.issue : null;
  const loading = validId && snapshot?.key !== issueId;
  const error = !validId ? t("common.error") : snapshot?.key === issueId ? snapshot.error : null;
  const setIssue: UseIssueDetailResult["setIssue"] = (updater) => {
    setSnapshot(current => ({ key: issueId, error: null, issue: typeof updater === "function" ? updater(current?.key === issueId ? current.issue : null) : updater }));
  };
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ available: boolean } | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<{ issue: Issue; values: AllowedStatusView[] } | null>(null);
  const transitionStatuses = liveStatuses?.issue === issue ? liveStatuses.values : issue?.allowedStatuses ?? [];
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [priorities, setPriorities] = useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<Array<{
    id: number;
    name: string;
    fieldFormat: string;
    possibleValues: Array<{ value: string }> | null;
    required: boolean;
  }>>([]);
  const [isFavorited, setIsFavorited] = useState(false);
  const [hydratedRelatedIds, setHydratedRelatedIds] = useState<Set<number>>(new Set());
  const issueRequestRef = useRef<AbortController | null>(null);
  const prefetchedRelatedIdsRef = useRef<Set<number>>(new Set());
  const attachmentRefreshAttemptedRef = useRef<Set<number>>(new Set());

  async function reloadIssue() {
    const request = issueRequestRef.current;
    let res: Response;
    let data;
    try {
      res = await fetch(`/api/issues/${issueId}?fresh=1`, { cache: "no-store", signal: request?.signal });
      data = await res.json();
    } catch (e) {
      // Navigation aborted the reload; the next issue owns the view now.
      if (request?.signal.aborted) return;
      throw e;
    }
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to load issue");
    }
    if (request === issueRequestRef.current && !request?.signal.aborted) setIssue(data.issue ?? null);
  }

  async function refreshIssueFromRedmine() {
    setRefreshBusy(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/refresh`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to refresh issue");
      }
      await reloadIssue();
    } finally {
      setRefreshBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!issue?.redmineIssueId) return;
    try {
      const res = await fetch(`/api/issues/${issue.redmineIssueId}/favorite`, {
        method: isFavorited ? "DELETE" : "POST",
      });
      if (res.ok) {
        setIsFavorited(!isFavorited);
      }
    } catch {
      // Ignore errors
    }
  }

  useEffect(() => {
    if (!issueId.trim()) return;
    const controller = new AbortController();
    issueRequestRef.current = controller;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issueId}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load issue");
        if (!controller.signal.aborted) setSnapshot({ key: issueId, issue: data.issue ?? null, error: null });
      } catch (e) {
        if (!controller.signal.aborted) setSnapshot({ key: issueId, issue: null, error: e instanceof Error ? e.message : "Failed to load issue" });
      }
    })();
    return () => controller.abort();
  }, [issueId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/status", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setAiStatus(data);
        }
      } catch {
        setAiStatus(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!issue) {
      return;
    }
    // Only fetch live statuses for Redmine issues, not local issues
    if (!issue.redmineIssueId) {
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/status`, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (mounted && Array.isArray(data.allowedStatuses)) {
          setLiveStatuses({ issue, values: data.allowedStatuses });
        }
      } catch {
        // Keep cached allowed statuses when the live lookup is unavailable.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [issue]);

  // Load activities and assignable users
  useEffect(() => {
    void (async () => {
      try {
        const [activitiesRes, usersRes, prioritiesRes, customFieldsRes] = await Promise.all([
          fetch("/api/internal/activities", { cache: "no-store" }),
          fetch("/api/internal/users", { cache: "no-store" }),
          fetch("/api/internal/priorities", { cache: "no-store" }),
          fetch("/api/internal/custom-fields", { cache: "no-store" }),
        ]);
        if (activitiesRes.ok) {
          const data = await activitiesRes.json();
          setActivities(data.activities ?? []);
        }
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users ?? []);
        }
        if (prioritiesRes.ok) {
          const data = await prioritiesRes.json();
          setPriorities(data.priorities ?? []);
        }
        if (customFieldsRes.ok) {
          const data = await customFieldsRes.json();
          setCustomFieldDefs(data.customFields ?? []);
        }
      } catch {
        // Ignore errors
      }
    })();
  }, []);

  useEffect(() => {
    if (!issue || issue.source === "local") return;
    (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/favorite`);
        if (res.ok) {
          const data = await res.json();
          setIsFavorited(data.favorited ?? false);
        }
      } catch {
        // Ignore errors
      }
    })();
  }, [issue]);

  const relatedPrefetchKey = issue
    ? Array.from(new Set([
      ...issue.children.map((child) => child.id),
      ...issue.breadcrumbs
        .map((crumb) => crumb.id)
        .filter((crumbId) => crumbId !== issue.redmineIssueId),
    ]))
      .sort((a, b) => a - b)
      .join(",")
    : "";

  useEffect(() => {
    if (!issue) {
      return;
    }

    const breadcrumbIds = issue.breadcrumbs
      .map((crumb) => crumb.id)
      .filter((crumbId) => crumbId !== issue.redmineIssueId);
    const childIds = issue.children
      .map((child) => child.id)
      .filter((childId) => childId !== issue.redmineIssueId);

    const orderedRelatedIds = [...new Set([...breadcrumbIds, ...childIds])];
    const pendingIds = orderedRelatedIds
      .filter((relatedId) => !prefetchedRelatedIdsRef.current.has(relatedId))
      .slice(0, 30);

    if (pendingIds.length === 0) {
      return;
    }

    let cancelled = false;
    const batchSize = 3;

    const timer = window.setTimeout(() => {
      void (async () => {
        for (let i = 0; i < pendingIds.length && !cancelled; i += batchSize) {
          const batch = pendingIds.slice(i, i + batchSize);
          await Promise.allSettled(
            batch.map(async (relatedId) => {
              if (cancelled) return;
              prefetchedRelatedIdsRef.current.add(relatedId);
              const res = await fetch(`/api/issues/${relatedId}`, { cache: "no-store" });
              if (!res.ok) {
                // Retry eligible on a future parent view if hydration failed this time.
                prefetchedRelatedIdsRef.current.delete(relatedId);
                return;
              }
              setHydratedRelatedIds((prev) => {
                if (prev.has(relatedId)) return prev;
                const next = new Set(prev);
                next.add(relatedId);
                return next;
              });
            }),
          );
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [issue, relatedPrefetchKey]);

  const hasUnresolvedAttachmentRefs = useMemo(() => {
    if (!issue) return false;
    const attachmentNames = new Set(
      issue.attachments.map((attachment) => normalizeAttachmentFilename(attachment.filename)),
    );
    const refs = [
      ...(issue.description ? extractAttachmentRefsFromText(issue.description) : []),
      ...issue.journals.flatMap((journal) => extractAttachmentRefsFromText(journal.notes ?? "")),
    ];
    if (refs.length === 0) return false;
    return refs.some((ref) => !attachmentNames.has(normalizeAttachmentFilename(ref)));
  }, [issue]);

  useEffect(() => {
    if (!issue || !hasUnresolvedAttachmentRefs || !issue.redmineIssueId) {
      return;
    }
    if (attachmentRefreshAttemptedRef.current.has(issue.redmineIssueId)) {
      return;
    }
    attachmentRefreshAttemptedRef.current.add(issue.redmineIssueId);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/issues/${issue.redmineIssueId}/attachments?refresh=1`, { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!cancelled && Array.isArray(data.items)) {
          setSnapshot((current) => {
            if (!current?.issue || current.issue.redmineIssueId !== issue.redmineIssueId) return current;
            return { ...current, issue: { ...current.issue, attachments: data.items } };
          });
        }
      } catch {
        // Keep current payload when attachment refresh fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [issue, hasUnresolvedAttachmentRefs]);

  return {
    issue,
    setIssue,
    loading,
    error,
    reloadIssue,
    refreshIssueFromRedmine,
    refreshBusy,
    aiStatus,
    transitionStatuses,
    activities,
    users,
    priorities,
    customFieldDefs,
    isFavorited,
    toggleFavorite,
    hydratedRelatedIds,
  };
}
