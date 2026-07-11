"use client";

import { useState, useEffect, useCallback } from "react";
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
  
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string | number | boolean | null>>({
    project: initialProject,
    status: initialStatus,
  });

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...filters,
      });
      
      const res = await fetch(`/api/issues?${params}`);
      if (!res.ok) throw new Error("Failed to fetch issues");
      
      const data = await res.json();
      setIssues(data.issues || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      await fetchIssues();
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setIssues(data.issues || []);
      setTotal(data.total || 0);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [fetchIssues]);

  return {
    issues,
    total,
    page,
    setPage,
    loading,
    error,
    refetch: fetchIssues,
    search,
    filters,
    setFilters,
  };
}