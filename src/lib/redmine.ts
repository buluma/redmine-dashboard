import { logEvent } from "@/src/lib/log";

export type RedmineCurrentUser = {
  id: number;
  login: string;
  firstname: string;
  lastname: string;
};

type RedmineIssueListResponse = {
  issues: Array<Record<string, unknown>>;
  total_count: number;
  offset: number;
  limit: number;
};

type RedmineTimeEntryListResponse = {
  time_entries: Array<Record<string, unknown>>;
  total_count: number;
  offset: number;
  limit: number;
};

export type RedmineIssueDetail = {
  issue: Record<string, unknown>;
};

export type RedmineStatus = { id: number; name: string; is_closed?: boolean };

export type RedmineActivity = { id: number; name: string };
export type RedminePriority = { id: number; name: string; is_default?: boolean; active?: boolean; position?: number };

type RedmineSearchResult = {
  id: number;
  title?: string;
  type?: string;
  url?: string;
  description?: string;
  datetime?: string;
};

type RedmineSearchResponse = {
  results: RedmineSearchResult[];
  total_count: number;
  offset: number;
  limit: number;
};

type RedmineRelationPayload = {
  issue_to_id: number;
  relation_type: string;
  delay?: number;
};

type RedmineRelationResponse = {
  relation: {
    id: number;
  };
};

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function redmineDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class RedmineClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(
    path: string,
    init?: RequestInit & {
      skipJsonContentType?: boolean;
    },
  ): Promise<T> {
    const maxAttempts = 3;
    const timeoutMs = 12000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const { skipJsonContentType, ...requestInit } = init ?? {};
        const res = await fetch(`${trimBaseUrl(this.baseUrl)}${path}`, {
          ...requestInit,
          headers: {
            ...(skipJsonContentType ? {} : { "Content-Type": "application/json" }),
            "X-Redmine-API-Key": this.apiKey,
            ...(requestInit.headers ?? {}),
          },
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text();
          const retryable = res.status >= 500 || res.status === 429;
          if (retryable && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
            continue;
          }
          throw new Error(`Redmine request failed (${res.status}): ${body.slice(0, 300)}`);
        }

        if (res.status === 204) {
          return null as T;
        }

        const raw = await res.text();
        if (!raw.trim()) {
          return null as T;
        }

        return JSON.parse(raw) as T;
      } catch (error) {
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (attempt < maxAttempts && isAbort) {
          await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
          continue;
        }
        if (attempt < maxAttempts && error instanceof TypeError) {
          await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("Redmine request failed after retries");
  }

  async getCurrentUser(): Promise<RedmineCurrentUser> {
    const data = await this.request<{ user: RedmineCurrentUser }>("/users/current.json");
    return data.user;
  }

  async getIssueStatuses(): Promise<RedmineStatus[]> {
    const data = await this.request<{ issue_statuses: RedmineStatus[] }>("/issue_statuses.json");
    return data.issue_statuses;
  }

  async getTimeEntryActivities(): Promise<RedmineActivity[]> {
    const data = await this.request<{ time_entry_activities: RedmineActivity[] }>(
      "/enumerations/time_entry_activities.json",
    );
    return data.time_entry_activities;
  }

  async getIssuePriorities(): Promise<RedminePriority[]> {
    const data = await this.request<{ issue_priorities: RedminePriority[] }>(
      "/enumerations/issue_priorities.json",
    );
    return data.issue_priorities;
  }

  async listIssueTimeEntries(issueId: number): Promise<Array<Record<string, unknown>>> {
    const limit = 100;
    const out: Array<Record<string, unknown>> = [];
    let offset = 0;

    while (true) {
      const path = `/time_entries.json?issue_id=${issueId}&limit=${limit}&offset=${offset}`;
      const data = await this.request<RedmineTimeEntryListResponse>(path);
      out.push(...data.time_entries);
      offset += data.time_entries.length;

      if (offset >= data.total_count || data.time_entries.length === 0) {
        break;
      }
    }

    return out;
  }

  async listAssignedIssues(updatedOnOrAfter?: Date): Promise<Array<Record<string, unknown>>> {
    const limit = 100;
    const out: Array<Record<string, unknown>> = [];
    let offset = 0;

    while (true) {
      const filterUpdated = updatedOnOrAfter
        ? `&updated_on=%3E%3D${encodeURIComponent(redmineDate(updatedOnOrAfter))}`
        : "";

      const path = `/issues.json?assigned_to_id=me&status_id=*&sort=updated_on:desc&limit=${limit}&offset=${offset}${filterUpdated}`;

      let data: RedmineIssueListResponse;
      try {
        data = await this.request<RedmineIssueListResponse>(path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const invalidUpdatedFilter = message.includes("Redmine request failed (422)") && /updated is invalid/i.test(message);
        if (updatedOnOrAfter && invalidUpdatedFilter) {
          // Some Redmine instances reject strict updated_on syntax. Fall back to full assigned-issues fetch.
          logEvent("redmine.issues.updated_filter_fallback", {
            updatedOnOrAfter: redmineDate(updatedOnOrAfter),
          }, "warn");
          return this.listAssignedIssues();
        }
        throw error;
      }
      out.push(...data.issues);
      offset += data.issues.length;

      if (offset >= data.total_count || data.issues.length === 0) {
        break;
      }
    }

    return out;
  }

  async getIssue(issueId: number, include: string[] = []): Promise<RedmineIssueDetail> {
    const query = include.length > 0 ? `?include=${include.join(",")}` : "";
    return this.request<RedmineIssueDetail>(`/issues/${issueId}.json${query}`);
  }

  async uploadFile(input: {
    filename: string;
    contentType?: string;
    bytes: ArrayBuffer;
  }): Promise<{ token: string }> {
    const params = new URLSearchParams({ filename: input.filename });
    const payload = await this.request<{ upload: { token: string } }>(`/uploads.json?${params.toString()}`, {
      method: "POST",
      body: input.bytes,
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
      },
      skipJsonContentType: true,
    });
    return payload.upload;
  }

  async addIssueAttachment(input: {
    issueId: number;
    token: string;
    filename: string;
    contentType?: string;
    description?: string;
  }): Promise<void> {
    await this.request(`/issues/${input.issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        issue: {
          uploads: [
            {
              token: input.token,
              filename: input.filename,
              description: input.description,
              content_type: input.contentType,
            },
          ],
        },
      }),
    });
  }

  async updateIssueStatus(issueId: number, statusId: number, note?: string): Promise<void> {
    await this.request(`/issues/${issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({ issue: { status_id: statusId, notes: note ?? "" } }),
    });
  }

  async addComment(issueId: number, comment: string): Promise<void> {
    await this.request(`/issues/${issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({ issue: { notes: comment } }),
    });
  }

  async addTimeEntry(input: {
    issueId: number;
    hours: number;
    activityId: number;
    comments?: string;
    spentOn: string;
  }): Promise<{ time_entry?: { id: number } } | null> {
    return this.request<{ time_entry?: { id: number } } | null>("/time_entries.json", {
      method: "POST",
      body: JSON.stringify({
        time_entry: {
          issue_id: input.issueId,
          hours: input.hours,
          activity_id: input.activityId,
          comments: input.comments,
          spent_on: input.spentOn,
        },
      }),
    });
  }

  async listTimeEntries(input: {
    issueId?: number;
    userId?: "me" | number;
    from?: string;
    to?: string;
    offset?: number;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams();
    if (input.issueId) params.set("issue_id", String(input.issueId));
    if (input.userId !== undefined) params.set("user_id", String(input.userId));
    if (input.from) params.set("from", input.from);
    if (input.to) params.set("to", input.to);
    params.set("offset", String(input.offset ?? 0));
    params.set("limit", String(input.limit ?? 100));
    const data = await this.request<RedmineTimeEntryListResponse>(`/time_entries.json?${params.toString()}`);
    return data.time_entries;
  }

  async updateTimeEntry(
    timeEntryId: number,
    input: {
      hours?: number;
      activityId?: number;
      comments?: string;
      spentOn?: string;
    },
  ): Promise<void> {
    await this.request(`/time_entries/${timeEntryId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        time_entry: {
          ...(input.hours !== undefined ? { hours: input.hours } : {}),
          ...(input.activityId !== undefined ? { activity_id: input.activityId } : {}),
          ...(input.comments !== undefined ? { comments: input.comments } : {}),
          ...(input.spentOn !== undefined ? { spent_on: input.spentOn } : {}),
        },
      }),
    });
  }

  async deleteTimeEntry(timeEntryId: number): Promise<void> {
    await this.request(`/time_entries/${timeEntryId}.json`, { method: "DELETE" });
  }

  async createIssueRelation(issueId: number, relation: RedmineRelationPayload): Promise<number | null> {
    const data = await this.request<RedmineRelationResponse | null>(`/issues/${issueId}/relations.json`, {
      method: "POST",
      body: JSON.stringify({ relation }),
    });
    return data?.relation?.id ?? null;
  }

  async deleteIssueRelation(relationId: number): Promise<void> {
    await this.request(`/relations/${relationId}.json`, { method: "DELETE" });
  }

  async search(input: {
    q: string;
    scope?: "issues" | "all";
    openOnly?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<RedmineSearchResponse> {
    const params = new URLSearchParams({
      q: input.q,
      offset: String(input.offset ?? 0),
      limit: String(input.limit ?? 25),
      all_words: "1",
      titles_only: "0",
    });
    if (input.scope && input.scope !== "all") {
      params.set("scope", input.scope);
    }
    if (input.openOnly) {
      params.set("open_issues", "1");
    }
    return this.request<RedmineSearchResponse>(`/search.json?${params.toString()}`);
  }

  async downloadAttachment(pathOrUrl: string): Promise<Response> {
    const base = trimBaseUrl(this.baseUrl);
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${base}${pathOrUrl}`;
    const res = await fetch(url, {
      headers: {
        "X-Redmine-API-Key": this.apiKey,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Redmine request failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return res;
  }
}
