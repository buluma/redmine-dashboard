"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Journal, TimeEntry, Attachment } from "@/src/types/dashboard";

export interface Issue {
  id: string;
  redmineIssueId: number;
  localIssueNumber?: number | null;
  redmineBaseUrl: string;
  subject: string;
  description: string | null;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  tracker: string | null;
  priority: string | null;
  priorityId: number | null;
  priorityName: string | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  updatedAt: string;
  updatedOnRemote: string;
  lastActivityAt: string | null;
  lastActivityType: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  estimatedHours: number | null;
  createdAt: string;
  journals?: Journal[];
  timeEntries?: TimeEntry[];
  attachments?: Attachment[];
}

export interface UseIssuesOptions {
  pageSize?: number;
  initialProject?: string | null;
  initialStatus?: string;
  searchSource?: "local_cache" | "hybrid" | "redmine";
}

export interface UseIssuesResult {
  issues: Issue[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  search: (query: string) => Promise<void>;
  filters: Record<string, string | number | boolean | null>;
  setFilters: (filters: Record<string, string | number | boolean | null>) => void;
}

export function useIssues(options: UseIssuesOptions = {}): UseIssuesResult {
  const { pageSize = 50, initialProject = null, initialStatus = "open" } = options;
  
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string | number | boolean | null>>({
    project: initialProject, status: initialStatus,
  });
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) params.set(key, String(value));
  }
  const url = query.trim() ? `/api/search?q=${encodeURIComponent(query)}` : `/api/issues?${params}`;
  const [snapshot, setSnapshot] = useState<{ url: string; issues: Issue[]; total: number; error: string | null }>({ url: "", issues: [], total: 0, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const key = url;
  const requestRef = useRef<AbortController | null>(null);
  const current = snapshot.url === key;

  const load = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    return fetch(url, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error("Failed to load issues");
        return res.json();
      })
      .then(data => {
        if (!controller.signal.aborted) setSnapshot({ url: key, issues: data.issues ?? data.results ?? [], total: data.total ?? 0, error: null });
      })
      .catch(err => {
        if (!controller.signal.aborted) setSnapshot({ url: key, issues: [], total: 0, error: err instanceof Error ? err.message : "Failed to load issues" });
      })
      .finally(() => { if (!controller.signal.aborted) setRefreshing(false); });
  }, [url, key]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const refetch = useCallback(async () => {
    setRefreshing(true);
    await load();
  }, [load]);
  const search = useCallback(async (value: string) => {
    setQuery(value);
    setPage(1);
  }, []);

  return {
    issues: current ? snapshot.issues : [], total: current ? snapshot.total : 0,
    page, setPage, loading: !current || refreshing, error: current ? snapshot.error : null,
    refetch, search, filters,
    setFilters: value => { setQuery(""); setFilters(value); },
  };
}
