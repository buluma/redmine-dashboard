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

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export class RedmineClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const maxAttempts = 3;
    const timeoutMs = 12000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${trimBaseUrl(this.baseUrl)}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            "X-Redmine-API-Key": this.apiKey,
            ...(init?.headers ?? {}),
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
        ? `&updated_on=%3E%3D${encodeURIComponent(updatedOnOrAfter.toISOString())}`
        : "";

      const path = `/issues.json?assigned_to_id=me&status_id=*&sort=updated_on:desc&limit=${limit}&offset=${offset}${filterUpdated}`;

      const data = await this.request<RedmineIssueListResponse>(path);
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
}
