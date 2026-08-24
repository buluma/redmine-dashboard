import { env } from "@/src/lib/env";
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
export type RedmineUser = { id: number; login?: string; firstname?: string; lastname?: string; name?: string };

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

type RedmineUserListResponse = {
  users: RedmineUser[];
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

export type SyncIssueScope = "assigned" | "open" | "all";

export type RedmineCustomField = {
  id: number;
  name: string;
  customized_type: string;
  field_format: string;
  possible_values: Array<{ value: string }> | null;
  default_value: string | null;
  editable: boolean;
  required: boolean;
};

export class RedmineError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly errors: string[] = [],
  ) {
    super(`Redmine request failed (${status})`);
    this.name = "RedmineError";
  }
}

export function isRedmineError(error: unknown): error is RedmineError {
  return error instanceof RedmineError;
}

export function redmineStatusFromError(error: unknown): number | null {
  return isRedmineError(error) ? error.status : null;
}

export function redmineMessageFromError(error: unknown, fallback: string): string {
  if (!isRedmineError(error)) {
    return error instanceof Error ? error.message : fallback;
  }
  if (error.errors.length > 0) {
    return error.errors.join(", ");
  }
  return fallback;
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function redmineDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class RedmineClient {
  private dispatcher: unknown | null = null;
  private dispatcherLoaded = false;

  constructor(
    public readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  get normalizedBaseUrl(): string {
    return trimBaseUrl(this.baseUrl);
  }

  private host(): string | null {
    try {
      return new URL(trimBaseUrl(this.baseUrl)).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private allowInsecureTls(): boolean {
    const host = this.host();
    if (!host) {
      return false;
    }
    return env.redmineInsecureTlsHosts.map((item) => item.toLowerCase()).includes(host);
  }

  private async getDispatcher(): Promise<unknown | undefined> {
    if (!this.allowInsecureTls()) {
      return undefined;
    }
    if (this.dispatcherLoaded) {
      return this.dispatcher ?? undefined;
    }
    this.dispatcherLoaded = true;
    try {
      const undici = await import("undici");
      this.dispatcher = new undici.Agent({
        connect: { rejectUnauthorized: false },
      });
      logEvent("redmine.tls.insecure_host_enabled", { host: this.host() }, "warn");
      return this.dispatcher;
    } catch {
      // If undici import fails, proceed with strict TLS instead of crashing.
      this.dispatcher = null;
      return undefined;
    }
  }

  private normalizeNetworkError(error: unknown): Error | null {
    if (!(error instanceof TypeError)) {
      return null;
    }
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" || code === "SELF_SIGNED_CERT_IN_CHAIN") {
      const host = this.host() ?? this.baseUrl;
      return new Error(
        `TLS certificate validation failed for ${host}. ` +
          `If this is staging, add its hostname to REDMINE_INSECURE_TLS_HOSTS.`,
      );
    }
    if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "ETIMEDOUT") {
      return new Error(`Network error reaching Redmine (${code ?? "unknown"}). Check base URL and connectivity.`);
    }
    return null;
  }

  private async request<T>(
    path: string,
    init?: RequestInit & {
      skipJsonContentType?: boolean;
    },
  ): Promise<T> {
    const maxAttempts = 3;
    const timeoutMs = this.options.timeoutMs ?? 12000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const { skipJsonContentType, ...requestInit } = init ?? {};
        const dispatcher = await this.getDispatcher();
        const fetchInit: RequestInit & { dispatcher?: unknown } = {
          ...requestInit,
          headers: {
            ...(skipJsonContentType ? {} : { "Content-Type": "application/json" }),
            "X-Redmine-API-Key": this.apiKey,
            ...(requestInit.headers ?? {}),
          },
          cache: "no-store",
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        };
        const res = await fetch(`${this.normalizedBaseUrl}${path}`, fetchInit);

        if (!res.ok) {
          const body = await res.text();
          const retryable = res.status >= 500 || res.status === 429;
          if (retryable && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
            continue;
          }
          throw new RedmineError(res.status, body, parseRedmineErrors(body));
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
        const normalized = this.normalizeNetworkError(error);
        if (normalized) {
          throw normalized;
        }
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
  
  async listProjects(): Promise<Array<{ id: number; name: string; identifier: string }>> {
    const data = await this.request<{ projects: Array<{ id: number; name: string; identifier: string }> }>("/projects.json?status=1&limit=100");
    return data.projects;
  }

  async listTrackers(): Promise<Array<{ id: number; name: string }>> {
    const data = await this.request<{ trackers: Array<{ id: number; name: string }> }>("/trackers.json");
    return data.trackers;
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

  async listUsers(): Promise<RedmineUser[]> {
    const limit = 100;
    const out: RedmineUser[] = [];
    let offset = 0;

    while (true) {
      const data = await this.request<RedmineUserListResponse>(`/users.json?status=1&limit=${limit}&offset=${offset}`);
      out.push(...data.users);
      offset += data.users.length;

      if (offset >= data.total_count || data.users.length === 0) {
        break;
      }
    }

    return out;
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

  async getCustomFields(): Promise<RedmineCustomField[]> {
    const data = await this.request<{ custom_fields: RedmineCustomField[] }>("/custom_fields.json");
    return data.custom_fields;
  }

  async getProjectCustomFields(projectId: number): Promise<RedmineCustomField[]> {
    const data = await this.request<{ custom_fields: RedmineCustomField[] }>(
      `/projects/${projectId}.json?include=custom_fields`,
    );
    return data.custom_fields ?? [];
  }

  async listIssues(
    scope: SyncIssueScope = "all",
    updatedOnOrAfter?: Date,
  ): Promise<Array<Record<string, unknown>>> {
    const limit = 100;
    const out: Array<Record<string, unknown>> = [];
    let offset = 0;

    while (true) {
      const filterUpdated = updatedOnOrAfter
        ? `&updated_on=%3E%3D${encodeURIComponent(redmineDate(updatedOnOrAfter))}`
        : "";

      const scopeQuery =
        scope === "assigned"
          ? "assigned_to_id=me&status_id=*"
          : scope === "open"
            ? "status_id=open"
            : "status_id=*";
      const path = `/issues.json?${scopeQuery}&sort=updated_on:desc&limit=${limit}&offset=${offset}${filterUpdated}`;

      let data: RedmineIssueListResponse;
      try {
        data = await this.request<RedmineIssueListResponse>(path);
      } catch (error) {
        const invalidUpdatedFilter =
          isRedmineError(error) &&
          error.status === 422 &&
          /updated is invalid/i.test([error.body, ...error.errors].join(" "));
        if (updatedOnOrAfter && invalidUpdatedFilter) {
          // Some Redmine instances reject strict updated_on syntax. Fall back to full scoped fetch.
          logEvent("redmine.issues.updated_filter_fallback", {
            scope,
            updatedOnOrAfter: redmineDate(updatedOnOrAfter),
          }, "warn");
          return this.listIssues(scope);
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

  // Fetches specific issues by id with no assigned_to_id filter — unlike
  // listIssues("assigned", ...), this still returns an issue after it's been
  // reassigned away from the credential owner. Used to re-check issues our
  // cache believes are still assigned to the user, since a scoped incremental
  // poll can never observe that belief going stale (the reassigned issue
  // simply stops matching the scope query and drops out of every future
  // fetch, so its cached assignee sticks forever otherwise).
  async listIssuesByIds(issueIds: number[]): Promise<Array<Record<string, unknown>>> {
    if (issueIds.length === 0) {
      return [];
    }

    const limit = 100;
    const out: Array<Record<string, unknown>> = [];

    // Redmine's issue_id filter accepts a comma list; chunk to stay well
    // under typical URL/query length limits.
    for (let i = 0; i < issueIds.length; i += limit) {
      const chunk = issueIds.slice(i, i + limit);
      const path = `/issues.json?issue_id=${chunk.join(",")}&status_id=*&limit=${limit}`;
      const data = await this.request<RedmineIssueListResponse>(path);
      out.push(...data.issues);
    }

    return out;
  }

  async getIssue(issueId: number, include: string[] = []): Promise<RedmineIssueDetail> {
    const query = include.length > 0 ? `?include=${include.join(",")}` : "";
    return this.request<RedmineIssueDetail>(`/issues/${issueId}.json${query}`);
  }

  // The nested `children` array on an issue's own payload (include=children) only
  // carries id/tracker/subject — Redmine's issue show API doesn't nest status or
  // assigned_to there. To show those columns for subtickets, fetch the children
  // as full issue records via parent_id instead.
  async listChildIssues(parentId: number): Promise<Array<Record<string, unknown>>> {
    const limit = 100;
    const out: Array<Record<string, unknown>> = [];
    let offset = 0;

    while (true) {
      const path = `/issues.json?parent_id=${parentId}&status_id=*&sort=id&limit=${limit}&offset=${offset}`;
      const data = await this.request<RedmineIssueListResponse>(path);
      out.push(...data.issues);
      offset += data.issues.length;

      if (offset >= data.total_count || data.issues.length === 0) {
        break;
      }
    }

    return out;
  }

  async createIssue(input: {
    subject: string;
    description?: string;
    projectId?: number;
    priorityId?: number;
    trackerId?: number;
    assignedToId?: number;
    startDate?: string;
    dueDate?: string;
    categoryId?: number;
    customFields?: Array<{ id: number; value: string }>;
    parentIssueId?: number;
  }): Promise<{ id: number; url: string }> {
    const response = await this.request<{ issue: { id: number } }>("/issues.json", {
      method: "POST",
      body: JSON.stringify({
        issue: {
          subject: input.subject,
          description: input.description,
          project_id: input.projectId,
          priority_id: input.priorityId,
          tracker_id: input.trackerId,
          assigned_to_id: input.assignedToId,
          start_date: input.startDate,
          due_date: input.dueDate,
          ...(input.categoryId !== undefined ? { category_id: input.categoryId } : {}),
          ...(input.customFields !== undefined ? { custom_fields: input.customFields } : {}),
          ...(input.parentIssueId !== undefined ? { parent_issue_id: input.parentIssueId } : {}),
        },
      }),
    });
    return {
      id: response.issue.id,
      url: `${this.normalizedBaseUrl}/issues/${response.issue.id}`,
    };
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
        "Content-Type": "application/octet-stream",
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

  async updateIssue(issueId: number, updates: {
    assignedToId?: number;
    statusId?: number;
    notes?: string;
    dueDate?: string;
    startDate?: string;
    estimatedHours?: number;
    doneRatio?: number;
    subject?: string;
    description?: string;
    priorityId?: number;
    trackerId?: number;
    customFields?: Array<{ id: number; value: string }>;
  }): Promise<void> {
    await this.request(`/issues/${issueId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        issue: {
          ...(updates.assignedToId !== undefined ? { assigned_to_id: updates.assignedToId } : {}),
          ...(updates.statusId !== undefined ? { status_id: updates.statusId } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
          ...(updates.dueDate !== undefined ? { due_date: updates.dueDate } : {}),
          ...(updates.startDate !== undefined ? { start_date: updates.startDate } : {}),
          ...(updates.estimatedHours !== undefined ? { estimated_hours: updates.estimatedHours } : {}),
          ...(updates.doneRatio !== undefined ? { done_ratio: updates.doneRatio } : {}),
          ...(updates.subject !== undefined ? { subject: updates.subject } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.priorityId !== undefined ? { priority_id: updates.priorityId } : {}),
          ...(updates.trackerId !== undefined ? { tracker_id: updates.trackerId } : {}),
          ...(updates.customFields !== undefined ? { custom_fields: updates.customFields } : {}),
        },
      }),
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
    const dispatcher = await this.getDispatcher();
    const init: RequestInit & { dispatcher?: unknown } = {
      headers: {
        "X-Redmine-API-Key": this.apiKey,
      },
      cache: "no-store",
      ...(dispatcher ? { dispatcher } : {}),
    };
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text();
      throw new RedmineError(res.status, body, parseRedmineErrors(body));
    }
    return res;
  }
}

function parseRedmineErrors(body: string): string[] {
  if (!body.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(body) as { errors?: unknown };
    if (Array.isArray(parsed.errors)) {
      return parsed.errors.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Redmine can return XML or HTML for some failures; callers still get status + sanitized fallback.
  }
  return [];
}
