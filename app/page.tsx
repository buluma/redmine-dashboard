"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  username: string;
  displayName: string;
};

type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  createdOnRemote: string;
};

type TimeEntry = {
  id: string;
  hours: number;
  activityId: number;
  comments: string | null;
  spentOn: string;
};

type Issue = {
  id: string;
  redmineIssueId: number;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  statusId: number;
  statusName: string;
  assignedToName: string | null;
  updatedOnRemote: string;
  dueDate: string | null;
  doneRatio: number | null;
  journals: Journal[];
  timeEntries: TimeEntry[];
};

type StatusCatalog = { id: number; name: string; isClosed: boolean };

type SyncState = {
  lastSyncStatus: string;
  lastIncrementalSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  runningJobId: string | null;
} | null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState<StatusCatalog[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [activities, setActivities] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualRefreshBusy, setManualRefreshBusy] = useState(false);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated_desc");

  const [comment, setComment] = useState("");
  const [hours, setHours] = useState("1");
  const [activityId, setActivityId] = useState(0);
  const [timeComment, setTimeComment] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));

  const selectedIssue = useMemo(
    () => issues.find((i) => i.redmineIssueId === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (projectFilter) params.set("project", projectFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);
    if (sort) params.set("sort", sort);
    params.set("page", "1");
    params.set("pageSize", "100");
    return params.toString();
  }, [priorityFilter, projectFilter, search, sort, statusFilter]);

  async function loadSession() {
    const res = await fetch("/api/session/me", { cache: "no-store" });
    const data = await res.json();
    setUser(data.user ?? null);
  }

  async function loadSyncStatus() {
    if (!user) return;
    const res = await fetch("/api/sync/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setSyncState(data.state ?? null);
    }
  }

  async function loadIssues() {
    if (!user) return;
    const res = await fetch(`/api/issues?${queryString}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Failed to load issues");
    }

    const data = await res.json();
    setIssues(data.items ?? []);
    setTotal(data.total ?? 0);
    setStatuses(data.filters?.statuses ?? []);
    setProjects(data.filters?.projects ?? []);
    setPriorities(data.filters?.priorities ?? []);
  }

  async function loadActivities() {
    if (!user) return;
    const res = await fetch("/api/internal/activities", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const fetched = data.activities ?? [];
      setActivities(fetched);
      if (fetched.length > 0 && activityId === 0) {
        setActivityId(fetched[0].id);
      }
    }
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await loadIssues();
      await loadSyncStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadSession();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;

    void refreshAll();
    void loadActivities();

    const id = setInterval(() => {
      void refreshAll();
    }, 60000);

    return () => clearInterval(id);
  }, [queryString, user]);

  async function connectRedmine(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/redmine/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Connection failed");
      }

      setUser(data.user);
      await refreshAll();
      await loadActivities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleManualPull() {
    setManualRefreshBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/sync/manual-pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to start manual pull");
      }

      const jobId = data.jobId as string;
      let attempts = 0;
      while (attempts < 30) {
        const statusRes = await fetch("/api/sync/status", { cache: "no-store" });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setSyncState(statusData.state ?? null);
          const latest = statusData.latestJob;
          if (latest?.id === jobId && ["success", "failed"].includes(latest.status)) {
            break;
          }
        }

        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Manual pull failed");
    } finally {
      setManualRefreshBusy(false);
    }
  }

  async function updateStatus(issue: Issue, nextStatusId: number) {
    const previous = [...issues];
    const nextStatus = statuses.find((s) => s.id === nextStatusId);
    setIssues((current) =>
      current.map((item) =>
        item.redmineIssueId === issue.redmineIssueId
          ? {
              ...item,
              statusId: nextStatusId,
              statusName: nextStatus?.name ?? item.statusName,
            }
          : item,
      ),
    );

    try {
      const res = await fetch(`/api/issues/${issue.redmineIssueId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: nextStatusId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Status update failed");
      }

      await refreshAll();
    } catch (e) {
      setIssues(previous);
      setError(e instanceof Error ? e.message : "Status update failed");
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue || !comment.trim()) return;

    const toPost = comment;
    setComment("");

    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: toPost }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Comment failed");
      }
      await refreshAll();
    } catch (e) {
      setComment(toPost);
      setError(e instanceof Error ? e.message : "Comment failed");
    }
  }

  async function submitTimelog(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedIssue) return;

    try {
      const res = await fetch(`/api/issues/${selectedIssue.redmineIssueId}/timelog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: Number(hours),
          activityId,
          comment: timeComment,
          spentOn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Timelog failed");
      }
      setTimeComment("");
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timelog failed");
    }
  }

  if (!user) {
    return (
      <main className="container auth-shell">
        <section className="card auth-card">
          <h1>Connect Redmine</h1>
          <p className="muted">Connect your Redmine API key to load issues assigned to you.</p>
          <form className="form" onSubmit={connectRedmine}>
            <label>
              Base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://redmine.example.com"
                required
              />
            </label>
            <label>
              API Key
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="your-redmine-api-key"
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Connecting..." : "Connect"}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="topbar card">
        <div>
          <h1>Assigned Issues Dashboard</h1>
          <p className="muted">
            Signed in as <strong>{user.displayName}</strong> ({user.username})
          </p>
          <p className="muted">
            Sync: {syncState?.lastSyncStatus ?? "idle"}
            {syncState?.lastIncrementalSyncAt
              ? ` | Last update ${new Date(syncState.lastIncrementalSyncAt).toLocaleString()}`
              : " | No sync yet"}
          </p>
        </div>
        <button onClick={handleManualPull} disabled={manualRefreshBusy}>
          {manualRefreshBusy ? "Refreshing..." : "Force Refresh"}
        </button>
      </header>

      <section className="card filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All Priorities</option>
          {priorities.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updated_desc">Updated (Newest)</option>
          <option value="updated_asc">Updated (Oldest)</option>
          <option value="priority">Priority</option>
          <option value="due_date">Due Date</option>
        </select>

        <input
          placeholder="Search subject/description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {error && <p className="error">{error}</p>}

      <section className="layout-grid">
        <article className="card issues-table-wrap">
          <div className="table-head">
            <h2>Issues ({total})</h2>
            {loading && <span className="muted">Refreshing...</span>}
          </div>

          <table className="issues-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Project</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} onClick={() => setSelectedIssueId(issue.redmineIssueId)}>
                  <td>#{issue.redmineIssueId}</td>
                  <td>{issue.subject}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select
                      value={issue.statusId}
                      onChange={(e) => updateStatus(issue, Number(e.target.value))}
                    >
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{issue.priority ?? "-"}</td>
                  <td>{issue.projectName ?? "-"}</td>
                  <td>{new Date(issue.updatedOnRemote).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <aside className="card drawer">
          {!selectedIssue && <p className="muted">Select an issue to see details.</p>}

          {selectedIssue && (
            <>
              <h2>
                #{selectedIssue.redmineIssueId} {selectedIssue.subject}
              </h2>
              <p className="muted">
                {selectedIssue.projectName ?? "No Project"} | {selectedIssue.statusName} |{" "}
                {selectedIssue.priority ?? "No Priority"}
              </p>
              <p className="description">{selectedIssue.description ?? "No description."}</p>

              <div className="section">
                <h3>Comments</h3>
                <form className="form" onSubmit={submitComment}>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment"
                    rows={3}
                  />
                  <button type="submit">Post Comment</button>
                </form>
                <div className="timeline">
                  {selectedIssue.journals.length === 0 && <p className="muted">No comments yet.</p>}
                  {selectedIssue.journals.map((j) => (
                    <div key={j.id} className="timeline-item">
                      <p>
                        <strong>{j.author ?? "Unknown"}</strong> • {new Date(j.createdOnRemote).toLocaleString()}
                      </p>
                      <p>{j.notes ?? "(empty note)"}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="section">
                <h3>Time Logs</h3>
                <form className="form" onSubmit={submitTimelog}>
                  <label>
                    Hours
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    />
                  </label>
                  <label>
                    Activity
                    <select value={activityId} onChange={(e) => setActivityId(Number(e.target.value))}>
                      {activities.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Date
                    <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
                  </label>
                  <label>
                    Comment
                    <textarea
                      value={timeComment}
                      onChange={(e) => setTimeComment(e.target.value)}
                      placeholder="What did you work on?"
                      rows={2}
                    />
                  </label>
                  <button type="submit">Add Time Log</button>
                </form>

                <div className="timeline">
                  {selectedIssue.timeEntries.length === 0 && <p className="muted">No time entries yet.</p>}
                  {selectedIssue.timeEntries.map((t) => (
                    <div key={t.id} className="timeline-item">
                      <p>
                        <strong>{t.hours}h</strong> • {new Date(t.spentOn).toLocaleDateString()}
                      </p>
                      <p>{t.comments ?? "(no comment)"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
