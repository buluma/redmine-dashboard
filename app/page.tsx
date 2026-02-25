"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const POLL_INTERVAL_MS = 60_000;

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function normalizeStatus(statusName: string): string {
  return statusName.toLowerCase();
}

function isOpenStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return !s.includes("closed") && !s.includes("resolved") && !s.includes("done");
}

function isInProgressStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("progress") || s.includes("in dev") || s.includes("ongoing");
}

function isDoneStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("resolved") || s.includes("closed") || s.includes("done");
}

function isBlockedStatus(statusName: string): boolean {
  const s = normalizeStatus(statusName);
  return s.includes("blocked") || s.includes("hold") || s.includes("waiting");
}

function dueInDays(dueDate: string | null): number | null {
  if (!dueDate) {
    return null;
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function issueUrgency(issue: Issue): "overdue" | "soon" | "done" | "normal" {
  if (isDoneStatus(issue.statusName)) {
    return "done";
  }
  const days = dueInDays(issue.dueDate);
  if (days === null) {
    return "normal";
  }
  if (days < 0) {
    return "overdue";
  }
  if (days <= 3) {
    return "soon";
  }
  return "normal";
}

function syncTone(status: string | undefined): "idle" | "running" | "success" | "failed" {
  if (status === "running") return "running";
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  return "idle";
}

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
  const [allowedStatusIdsByIssue, setAllowedStatusIdsByIssue] = useState<Record<number, number[]>>({});

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

  const summary = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byProject = new Map<string, number>();
    const byPriority = new Map<string, number>();

    let open = 0;
    let inProgress = 0;
    let done = 0;
    let blocked = 0;
    let overdue = 0;
    let dueSoon = 0;
    let totalProgress = 0;

    for (const issue of issues) {
      byStatus.set(issue.statusName, (byStatus.get(issue.statusName) ?? 0) + 1);
      byProject.set(issue.projectName ?? "Unassigned Project", (byProject.get(issue.projectName ?? "Unassigned Project") ?? 0) + 1);
      byPriority.set(issue.priority ?? "Unspecified", (byPriority.get(issue.priority ?? "Unspecified") ?? 0) + 1);

      if (isOpenStatus(issue.statusName)) open += 1;
      if (isInProgressStatus(issue.statusName)) inProgress += 1;
      if (isDoneStatus(issue.statusName)) done += 1;
      if (isBlockedStatus(issue.statusName)) blocked += 1;

      const urgency = issueUrgency(issue);
      if (urgency === "overdue") overdue += 1;
      if (urgency === "soon") dueSoon += 1;

      totalProgress += issue.doneRatio ?? 0;
    }

    const topStatuses = Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const topProjects = Array.from(byProject.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const priorityMix = Array.from(byPriority.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const count = issues.length || 1;
    const completion = Math.round((done / count) * 100);
    const avgDoneRatio = Math.round(totalProgress / count);

    return {
      totalVisible: issues.length,
      total,
      open,
      inProgress,
      done,
      blocked,
      overdue,
      dueSoon,
      completion,
      avgDoneRatio,
      topStatuses,
      topProjects,
      priorityMix,
    };
  }, [issues, total]);

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
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
    // refreshAll/loadActivities intentionally depend on current query + user snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const allowed = allowedStatusIdsByIssue[issue.redmineIssueId];
    if (allowed && allowed.length > 0 && !allowed.includes(nextStatusId)) {
      setError("Selected status is not allowed for this issue.");
      return;
    }

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

  async function loadAllowedStatuses(issueId: number) {
    if (allowedStatusIdsByIssue[issueId]) {
      return;
    }

    const res = await fetch(`/api/issues/${issueId}/status`, { cache: "no-store" });
    if (!res.ok) {
      return;
    }

    const data = await res.json();
    const ids = Array.isArray(data.allowedStatusIds) ? data.allowedStatusIds : [];
    setAllowedStatusIdsByIssue((current) => ({
      ...current,
      [issueId]: ids,
    }));
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

  function resetFilters() {
    setStatusFilter("");
    setProjectFilter("");
    setPriorityFilter("");
    setSearch("");
    setSort("updated_desc");
  }

  if (!user) {
    return (
      <main className="dashboard auth-shell">
        <section className="card auth-panel">
          <div className="auth-grid">
            <div>
              <p className="kicker">Redmine Operations</p>
              <h1>Mission Control Dashboard</h1>
              <p className="muted">
                Connect your Redmine account and run issue triage, status transitions, comments, and
                time logging from one place.
              </p>
            </div>
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
                {loading ? "Connecting..." : "Launch Dashboard"}
              </button>
            </form>
          </div>
          {error && <p className="error-banner">{error}</p>}
        </section>
      </main>
    );
  }

  const syncStateTone = syncTone(syncState?.lastSyncStatus);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Redmine Control Room</p>
            <h1>Assigned Issue Command Center</h1>
            <p className="muted">
              Signed in as <strong>{user.displayName}</strong> ({user.username})
            </p>
          </div>
          <div className={`sync-pill sync-${syncStateTone}`}>
            Sync: {syncState?.lastSyncStatus ?? "idle"}
            {syncState?.lastIncrementalSyncAt
              ? ` • ${new Date(syncState.lastIncrementalSyncAt).toLocaleString()}`
              : " • Waiting for first sync"}
          </div>
        </div>

        <div className="hero-actions">
          <button onClick={handleManualPull} disabled={manualRefreshBusy}>
            {manualRefreshBusy ? "Refreshing..." : "Force Refresh"}
          </button>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>

        <section className="metrics-grid">
          <article className="card metric-card">
            <p className="metric-label">Visible / Total</p>
            <p className="metric-value">
              {summary.totalVisible} <span>/ {summary.total}</span>
            </p>
            <div className="progress-track">
              <span
                className="progress-fill"
                style={{ width: `${Math.min(100, Math.round((summary.totalVisible / Math.max(1, summary.total)) * 100))}%` }}
              />
            </div>
          </article>
          <article className="card metric-card">
            <p className="metric-label">Open</p>
            <p className="metric-value">{summary.open}</p>
            <p className="metric-foot">In progress: {summary.inProgress}</p>
          </article>
          <article className="card metric-card">
            <p className="metric-label">Risk Bucket</p>
            <p className="metric-value">{summary.overdue}</p>
            <p className="metric-foot">Overdue issues • Due soon: {summary.dueSoon}</p>
          </article>
          <article className="card metric-card">
            <p className="metric-label">Delivery Health</p>
            <p className="metric-value">{summary.completion}%</p>
            <p className="metric-foot">Done: {summary.done} • Avg done ratio: {summary.avgDoneRatio}%</p>
          </article>
          <article className="card metric-card">
            <p className="metric-label">Blocked</p>
            <p className="metric-value">{summary.blocked}</p>
            <p className="metric-foot">Status contains blocked/hold/waiting</p>
          </article>
        </section>
      </header>

      <section className="card filters-panel">
        <div className="filters-grid">
          <label className="filter-field">
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            Project
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            Priority
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All Priorities</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated_desc">Updated (Newest)</option>
              <option value="updated_asc">Updated (Oldest)</option>
              <option value="priority">Priority</option>
              <option value="due_date">Due Date</option>
            </select>
          </label>

          <label className="filter-field search-field">
            Search
            <input
              placeholder="Subject, description, assignee"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="insights-grid">
        <article className="card">
          <h2>Status Mix</h2>
          <p className="muted">Click a status to filter quickly.</p>
          <div className="chip-row">
            {summary.topStatuses.length === 0 && <span className="muted">No status data yet.</span>}
            {summary.topStatuses.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`status-chip ${statusFilter === name ? "active" : ""}`}
                onClick={() => setStatusFilter(statusFilter === name ? "" : name)}
              >
                {name} <span>{count}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Project Load</h2>
          <div className="bars-list">
            {summary.topProjects.length === 0 && <span className="muted">No project data yet.</span>}
            {summary.topProjects.map(([name, count]) => (
              <div key={name} className="bar-row">
                <div className="bar-label-row">
                  <span>{name}</span>
                  <strong>{count}</strong>
                </div>
                <div className="bar-track">
                  <span className="bar-fill" style={{ width: `${Math.round((count / Math.max(1, summary.totalVisible)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Priority Mix</h2>
          <div className="bars-list">
            {summary.priorityMix.length === 0 && <span className="muted">No priority data yet.</span>}
            {summary.priorityMix.map(([name, count]) => (
              <div key={name} className="bar-row">
                <div className="bar-label-row">
                  <span>{name}</span>
                  <strong>{count}</strong>
                </div>
                <div className="bar-track">
                  <span className="bar-fill priority" style={{ width: `${Math.round((count / Math.max(1, summary.totalVisible)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      {error && <p className="error-banner">{error}</p>}

      <section className="workspace-grid">
        <article className="card issues-panel">
          <div className="table-toolbar">
            <h2>Issue Queue</h2>
            <p className="muted">{loading ? "Refreshing..." : `${issues.length} loaded`}</p>
          </div>

          <table className="issues-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Progress</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const urgency = issueUrgency(issue);
                const allowedStatusIds = allowedStatusIdsByIssue[issue.redmineIssueId];
                const selectableStatuses =
                  allowedStatusIds && allowedStatusIds.length > 0
                    ? statuses.filter((s) => allowedStatusIds.includes(s.id))
                    : statuses;

                return (
                  <tr
                    key={issue.id}
                    className={`issue-row ${selectedIssueId === issue.redmineIssueId ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedIssueId(issue.redmineIssueId);
                      void loadAllowedStatuses(issue.redmineIssueId);
                    }}
                  >
                    <td>#{issue.redmineIssueId}</td>
                    <td>
                      <div className="subject-cell">
                        <p>{issue.subject}</p>
                        <span className={`urgency-pill ${urgency}`}>{urgency}</span>
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select
                        className="status-select"
                        value={issue.statusId}
                        onChange={(e) => updateStatus(issue, Number(e.target.value))}
                        onFocus={() => {
                          void loadAllowedStatuses(issue.redmineIssueId);
                        }}
                      >
                        {selectableStatuses.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{issue.priority ?? "-"}</td>
                    <td>{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</td>
                    <td>{issue.doneRatio ?? 0}%</td>
                    <td>{new Date(issue.updatedOnRemote).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>

        <aside className="card drawer-panel">
          {!selectedIssue && (
            <div className="drawer-empty">
              <h3>No Issue Selected</h3>
              <p className="muted">Pick an issue from the queue to inspect details, add notes, and log time.</p>
            </div>
          )}

          {selectedIssue && (
            <>
              <div className="drawer-header">
                <div>
                  <h2>
                    #{selectedIssue.redmineIssueId} {selectedIssue.subject}
                  </h2>
                  <p className="issue-meta">
                    {selectedIssue.projectName ?? "No Project"} • {selectedIssue.statusName} • {selectedIssue.priority ?? "No Priority"}
                  </p>
                </div>
                <button className="secondary-button" type="button" onClick={() => setSelectedIssueId(null)}>
                  Close
                </button>
              </div>

              <section className="detail-section">
                <h3>Description</h3>
                {selectedIssue.description ? (
                  <MarkdownBlock content={selectedIssue.description} />
                ) : (
                  <p className="muted">No description.</p>
                )}
              </section>

              <section className="detail-section">
                <h3>Comments</h3>
                <form className="form" onSubmit={submitComment}>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share an update"
                    rows={3}
                  />
                  <button type="submit">Post Comment</button>
                </form>
                <div className="timeline">
                  {selectedIssue.journals.length === 0 && <p className="muted">No comments yet.</p>}
                  {selectedIssue.journals.map((j) => (
                    <div key={j.id} className="timeline-item">
                      <p className="muted">
                        <strong>{j.author ?? "Unknown"}</strong> • {new Date(j.createdOnRemote).toLocaleString()}
                      </p>
                      {j.notes ? <MarkdownBlock content={j.notes} /> : <p>(empty note)</p>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="detail-section">
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
                      placeholder="Summarize the work"
                      rows={2}
                    />
                  </label>
                  <button type="submit">Add Time Log</button>
                </form>

                <div className="timeline">
                  {selectedIssue.timeEntries.length === 0 && <p className="muted">No time entries yet.</p>}
                  {selectedIssue.timeEntries.map((t) => (
                    <div key={t.id} className="timeline-item">
                      <p className="muted">
                        <strong>{t.hours}h</strong> • {new Date(t.spentOn).toLocaleDateString()}
                      </p>
                      {t.comments ? <MarkdownBlock content={t.comments} /> : <p>(no comment)</p>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
