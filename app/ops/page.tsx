"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  username: string;
  displayName: string;
};

type SyncState = {
  lastSyncStatus: string;
  lastIncrementalSyncAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  runningJobId: string | null;
} | null;

type SyncJob = {
  id: string;
  jobType: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
  createdAt: string;
  durationMs: number | null;
};

type MobileToken = {
  id: string;
  name: string | null;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type WebLog = {
  id: string;
  userId: string | null;
  message: string;
  level: string;
  source: string | null;
  url: string | null;
  stack: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Metrics = {
  issues: number;
  users: number;
  syncJobs: number;
  auditLogs24h: number;
  webLogs24h: number;
  internalNotes: number;
  activeUsers: number;
};

type HealthPayload = {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      ok: boolean;
      latencyMs?: number;
      error?: string | null;
    };
    redmine: {
      ok: boolean;
      mode: "skipped" | "env_probe";
      latencyMs?: number;
      error?: string | null;
      user?: string;
    };
    scheduler: {
      lock: {
        ownerId: string;
        heartbeatAt: string;
        expiresAt: string;
      } | null;
      staleRunningJobs: number;
    };
    logPoller: {
      ok: boolean;
      enabled: boolean;
      leaderLockOwnerId?: string | null;
      heartbeatAt?: string;
      expiresAt?: string;
    };
    metrics: Metrics;
  };
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB");
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function checkPill(ok: boolean): string {
  return ok ? "sync-success" : "sync-failed";
}

export default function OpsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(null);
  const [latestJob, setLatestJob] = useState<SyncJob | null>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [mobileTokens, setMobileTokens] = useState<MobileToken[]>([]);
  const [logs, setLogs] = useState<WebLog[]>([]);
  const [logFilter, setLogFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function loadData() {
    setError(null);

    const sessionRes = await fetch("/api/session/me", { cache: "no-store" });
    const sessionData = await sessionRes.json();
    setUser(sessionData.user ?? null);

    if (!sessionData.user) {
      setSyncState(null);
      setLatestJob(null);
      setJobs([]);
      setHealth(null);
      setMobileTokens([]);
      return;
    }

    const [statusRes, jobsRes, healthRes, tokensRes, logsRes] = await Promise.all([
      fetch("/api/sync/status", { cache: "no-store" }),
      fetch("/api/sync/jobs?limit=60", { cache: "no-store" }),
      fetch("/api/health", { cache: "no-store" }),
      fetch("/api/mobile/tokens", { cache: "no-store" }),
      fetch("/api/logs?limit=100", { cache: "no-store" }),
    ]);

    if (!statusRes.ok) {
      const data = await statusRes.json();
      throw new Error(data.error ?? "Failed to load sync status");
    }
    const statusData = await statusRes.json();
    setSyncState(statusData.state ?? null);
    setLatestJob(statusData.latestJob ?? null);

    if (!jobsRes.ok) {
      const data = await jobsRes.json();
      throw new Error(data.error ?? "Failed to load sync jobs");
    }
    const jobsData = await jobsRes.json();
    setJobs(jobsData.items ?? []);

    const healthData = await healthRes.json();
    setHealth(healthData);

    if (!tokensRes.ok) {
      const data = await tokensRes.json();
      throw new Error(data.error ?? "Failed to load mobile tokens");
    }
    const tokensData = await tokensRes.json();
    setMobileTokens(tokensData.items ?? []);

    if (logsRes.ok) {
      const logsData = await logsRes.json();
      setLogs(logsData.items ?? []);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load ops data");
      } finally {
        setLoading(false);
      }
    })();

    const id = setInterval(() => {
      void loadData().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  async function retryFullSync() {
    setRetrying(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/sync/manual-pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to enqueue manual pull");
      }
      setInfo(`Manual sync enqueued: ${data.jobId}`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Manual sync failed");
    } finally {
      setRetrying(false);
    }
  }

  async function revokeToken(tokenId: string) {
    setRevokingTokenId(tokenId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/mobile/tokens/${tokenId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to revoke token");
      }
      setInfo("Mobile token revoked.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke token");
    } finally {
      setRevokingTokenId(null);
    }
  }

  async function cancelJob(jobId: string) {
    setCancelling(jobId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/ops/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to cancel job");
      }
      setInfo("Job cancelled.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel job");
    } finally {
      setCancelling(null);
    }
  }

  async function restartJob(jobId: string) {
    setRestarting(jobId);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/ops/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "restart" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to restart job");
      }
      setInfo("New incremental job created.");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart job");
    } finally {
      setRestarting(null);
    }
  }

  const runningJobs = useMemo(() => jobs.filter((job) => ["pending", "running"].includes(job.status)).length, [jobs]);
  const failedJobs = useMemo(() => jobs.filter((job) => job.status === "failed").length, [jobs]);
  const errorLogs = useMemo(
    () => logs.filter((l) => l.level === "error").length,
    [logs],
  );
  const filteredLogs = useMemo(
    () =>
      logFilter
        ? logs.filter(
            (l) =>
              l.message.toLowerCase().includes(logFilter.toLowerCase()) ||
              (l.url ?? "").toLowerCase().includes(logFilter.toLowerCase()) ||
              (l.stack ?? "").toLowerCase().includes(logFilter.toLowerCase()),
          )
        : logs,
    [logs, logFilter],
  );

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Converge Operations</p>
            <h1>Sync Ops Console</h1>
            <p className="muted">
              {user ? `Operator: ${user.displayName} (${user.username})` : "Not signed in"}
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={() => void loadData()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={retryFullSync} disabled={retrying || !user} title="Syncs issues updated in the last 24 hours">
              {retrying ? "Enqueueing..." : "Sync Last 24h"}
            </button>
            <Link href="/" className="primary-link nav-link">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {info && <p className="info-banner">{info}</p>}

      {!user && (
        <section className="card">
          <h2>Session Required</h2>
          <p className="muted">Connect Redmine first, then return to Sync Ops.</p>
          <div className="hero-actions">
            <Link href="/" className="primary-link nav-link">
              Open Dashboard
            </Link>
          </div>
        </section>
      )}

      {user && (
        <>
          <section className="ops-grid">
            <article className="card">
              <h2>Sync State</h2>
              <div className="ops-kv">
                <p><strong>Status:</strong> {syncState?.lastSyncStatus ?? "idle"}</p>
                <p><strong>Running Job:</strong> {syncState?.runningJobId ?? "-"}</p>
                <p><strong>Last Incremental:</strong> {formatDateTime(syncState?.lastIncrementalSyncAt ?? null)}</p>
                <p><strong>Last Full:</strong> {formatDateTime(syncState?.lastFullSyncAt ?? null)}</p>
                <p><strong>Last Error:</strong> {syncState?.lastError ?? "-"}</p>
              </div>
            </article>

            <article className="card">
              <h2>Job Snapshot</h2>
              <div className="ops-kv">
                <p><strong>Running/Pending:</strong> {runningJobs}</p>
                <p><strong>Failed (window):</strong> {failedJobs}</p>
                <p><strong>Latest Job:</strong> {latestJob?.id ?? "-"}</p>
                <p><strong>Latest Type:</strong> {latestJob?.jobType ?? "-"}</p>
                <p><strong>Latest Status:</strong> {latestJob?.status ?? "-"}</p>
                <p><strong>Latest Duration:</strong> {formatDuration(latestJob?.durationMs ?? null)}</p>
              </div>
            </article>
          </section>

          <section className="ops-grid">
            <article className="card">
              <h2>Health Checks</h2>
              <div className="health-grid">
                <div className="health-row">
                  <span>Overall</span>
                  <span className={`sync-pill ${checkPill(health?.status === "ok")}`}>{health?.status ?? "unknown"}</span>
                </div>
                <div className="health-row">
                  <span>Database</span>
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks?.database?.ok))}`}>
                    {health?.checks?.database?.ok ? "ok" : "failed"}
                  </span>
                </div>
                <div className="health-row">
                  <span>Redmine Probe</span>
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks?.redmine?.ok || health?.checks?.redmine?.mode === "skipped"))}`}>
                    {health?.checks?.redmine?.mode === "skipped" ? "skipped" : health?.checks?.redmine?.ok ? "ok" : "failed"}
                  </span>
                </div>
                <div className="health-row">
                  <span>Stale Jobs</span>
                  <span>{health?.checks?.scheduler?.staleRunningJobs ?? "-"}</span>
                </div>
              </div>
              <p className="muted ops-note">
                Checked at {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "-"}.
                {health?.checks?.redmine?.error ? ` Redmine error: ${health.checks.redmine.error}` : ""}
                {health?.checks?.database?.error ? ` DB error: ${health.checks.database.error}` : ""}
              </p>
            </article>

            <article className="card">
              <h2>Sync Poller Leader</h2>
              <div className="ops-kv">
                <p><strong>Owner:</strong> {health?.checks?.scheduler?.lock?.ownerId ?? "-"}</p>
                <p><strong>Heartbeat:</strong> {formatDateTime(health?.checks?.scheduler?.lock?.heartbeatAt ?? null)}</p>
                <p><strong>Expires:</strong> {formatDateTime(health?.checks?.scheduler?.lock?.expiresAt ?? null)}</p>
              </div>
            </article>

            <article className="card">
              <h2>Log Poller</h2>
              <div className="ops-kv">
                <p><strong>Enabled:</strong> {health?.checks?.logPoller?.enabled ? "Yes" : "No"}</p>
                <p><strong>Owner:</strong> {health?.checks?.logPoller?.leaderLockOwnerId ?? "-"}</p>
                <p><strong>Heartbeat:</strong> {formatDateTime(health?.checks?.logPoller?.heartbeatAt ?? null)}</p>
                <p><strong>Expires:</strong> {formatDateTime(health?.checks?.logPoller?.expiresAt ?? null)}</p>
              </div>
            </article>
          </section>

          <section className="ops-grid">
            <article className="card">
              <h2>System Metrics</h2>
              <div className="ops-kv">
                <p><strong>Version:</strong> {health?.version ?? "-"}</p>
                <p><strong>Environment:</strong> {health?.environment ?? "-"}</p>
                <p><strong>Uptime:</strong> {health?.uptime ? `${Math.floor(health.uptime / 86400)}d ${Math.floor((health.uptime % 86400) / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : "-"}</p>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <Link href="/ops/audit-logs" className="secondary-button">
                  📋 View Audit Logs
                </Link>
                <Link href="/ops/users" className="secondary-button" style={{ marginLeft: '0.5rem' }}>
                  👥 User Management
                </Link>
              </div>
            </article>

            <article className="card">
              <h2>Data Metrics</h2>
              <div className="ops-kv">
                <p><strong>Issues:</strong> {health?.checks?.metrics?.issues?.toLocaleString() ?? "-"}</p>
                <p><strong>Users:</strong> {health?.checks?.metrics?.users ?? "-"}</p>
                <p><strong>Active Users (24h):</strong> {health?.checks?.metrics?.activeUsers ?? "-"}</p>
                <p><strong>Internal Notes:</strong> {health?.checks?.metrics?.internalNotes?.toLocaleString() ?? "-"}</p>
              </div>
            </article>

            <article className="card">
              <h2>Activity Metrics (24h)</h2>
              <div className="ops-kv">
                <p><strong>Sync Jobs:</strong> {health?.checks?.metrics?.syncJobs ?? "-"}</p>
                <p><strong>Audit Logs:</strong> {health?.checks?.metrics?.auditLogs24h?.toLocaleString() ?? "-"}</p>
                <p><strong>Web Logs:</strong> {health?.checks?.metrics?.webLogs24h?.toLocaleString() ?? "-"}</p>
              </div>
            </article>
          </section>

          <section className="card">
            <div className="table-toolbar">
              <h2>Recent Sync Jobs</h2>
              <p className="muted">{jobs.length} rows</p>
            </div>
            <div className="drill-table-wrap">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Duration</th>
                    <th>Error</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className={job.status === 'running' && job.startedAt && Date.now() - new Date(job.startedAt).getTime() > 600000 ? 'stale-job' : ''}>
                      <td>{job.id}</td>
                      <td>{job.jobType}</td>
                      <td>
                        <span className={`status-chip ${job.status === 'running' && job.startedAt && Date.now() - new Date(job.startedAt).getTime() > 600000 ? 'sync-failed' : job.status === 'completed' ? 'sync-success' : ''}`}>
                          {job.status}
                          {job.status === 'running' && job.startedAt && Date.now() - new Date(job.startedAt).getTime() > 600000 ? ' (STALE)' : ''}
                        </span>
                      </td>
                      <td>{formatDateTime(job.startedAt)}</td>
                      <td>{formatDateTime(job.endedAt)}</td>
                      <td>{formatDuration(job.durationMs)}</td>
                      <td>{job.error ? job.error.slice(0, 140) : "-"}</td>
                      <td>
                        {job.status === 'running' && job.startedAt && Date.now() - new Date(job.startedAt).getTime() > 600000 ? (
                          <button
                            className="secondary-button"
                            onClick={() => cancelJob(job.id)}
                            disabled={cancelling === job.id}
                          >
                            {cancelling === job.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        ) : job.status === 'failed' ? (
                          <button
                            className="secondary-button"
                            onClick={() => restartJob(job.id)}
                            disabled={restarting === job.id}
                          >
                            {restarting === job.id ? 'Restarting...' : 'Restart'}
                          </button>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="table-toolbar">
              <h2>Active Mobile Tokens</h2>
              <p className="muted">{mobileTokens.length} active</p>
            </div>
            <div className="drill-table-wrap">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Created</th>
                    <th>Last Used</th>
                    <th>Expires</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mobileTokens.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">No active mobile tokens.</td>
                    </tr>
                  )}
                  {mobileTokens.map((token) => (
                    <tr key={token.id}>
                      <td>{token.name ?? "-"}</td>
                      <td>{token.tokenPrefix}</td>
                      <td>{formatDateTime(token.createdAt)}</td>
                      <td>{formatDateTime(token.lastUsedAt)}</td>
                      <td>{formatDateTime(token.expiresAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={revokingTokenId === token.id}
                          onClick={() => void revokeToken(token.id)}
                        >
                          {revokingTokenId === token.id ? "Revoking..." : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="table-toolbar">
              <h2>Web Logs</h2>
              <div className="toolbar-right">
                <span className="muted">{filteredLogs.length} of {logs.length} rows · {errorLogs} errors</span>
                <input
                  type="text"
                  placeholder="Filter..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="log-filter-input"
                />
              </div>
            </div>
            <div className="logs-list">
              {filteredLogs.length === 0 && (
                <p className="muted">No logs{logFilter ? " matching filter" : ""}.</p>
              )}
              {filteredLogs.map((log) => (
                <article key={log.id} className={`log-entry log-${log.level}`}>
                  <div className="log-head">
                    <span className={`log-level-badge log-${log.level}`}>{log.level}</span>
                    <span className="log-source">{log.source ?? "unknown"}</span>
                    <span className="log-time">{new Date(log.createdAt).toLocaleString("en-GB")}</span>
                  </div>
                  <div className="log-message">{log.message}</div>
                  {log.url && (
                    <div className="log-url">{log.url}</div>
                  )}
                  {log.stack && (
                    <details className="log-stack">
                      <summary>Stack trace</summary>
                      <pre>{log.stack}</pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
