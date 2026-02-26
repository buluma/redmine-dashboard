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

type HealthPayload = {
  status: "ok" | "degraded";
  timestamp: string;
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
  };
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
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
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
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
      return;
    }

    const [statusRes, jobsRes, healthRes] = await Promise.all([
      fetch("/api/sync/status", { cache: "no-store" }),
      fetch("/api/sync/jobs?limit=60", { cache: "no-store" }),
      fetch("/api/health", { cache: "no-store" }),
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

  const runningJobs = useMemo(() => jobs.filter((job) => ["pending", "running"].includes(job.status)).length, [jobs]);
  const failedJobs = useMemo(() => jobs.filter((job) => job.status === "failed").length, [jobs]);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">NRCC Operations</p>
            <h1>Sync Ops Console</h1>
            <p className="muted">
              {user ? `Operator: ${user.displayName} (${user.username})` : "Not signed in"}
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={() => void loadData()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={retryFullSync} disabled={retrying || !user}>
              {retrying ? "Enqueueing..." : "Retry Full Sync"}
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
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks.database.ok))}`}>
                    {health?.checks.database.ok ? "ok" : "failed"}
                  </span>
                </div>
                <div className="health-row">
                  <span>Redmine Probe</span>
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks.redmine.ok || health?.checks.redmine.mode === "skipped"))}`}>
                    {health?.checks.redmine.mode === "skipped" ? "skipped" : health?.checks.redmine.ok ? "ok" : "failed"}
                  </span>
                </div>
                <div className="health-row">
                  <span>Stale Jobs</span>
                  <span>{health?.checks.scheduler.staleRunningJobs ?? "-"}</span>
                </div>
              </div>
              <p className="muted ops-note">
                Checked at {health?.timestamp ? new Date(health.timestamp).toLocaleString() : "-"}.
                {health?.checks.redmine.error ? ` Redmine error: ${health.checks.redmine.error}` : ""}
                {health?.checks.database.error ? ` DB error: ${health.checks.database.error}` : ""}
              </p>
            </article>

            <article className="card">
              <h2>Leader Lock</h2>
              <div className="ops-kv">
                <p><strong>Owner:</strong> {health?.checks.scheduler.lock?.ownerId ?? "-"}</p>
                <p><strong>Heartbeat:</strong> {formatDateTime(health?.checks.scheduler.lock?.heartbeatAt ?? null)}</p>
                <p><strong>Expires:</strong> {formatDateTime(health?.checks.scheduler.lock?.expiresAt ?? null)}</p>
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
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.id}</td>
                      <td>{job.jobType}</td>
                      <td>{job.status}</td>
                      <td>{formatDateTime(job.startedAt)}</td>
                      <td>{formatDateTime(job.endedAt)}</td>
                      <td>{formatDuration(job.durationMs)}</td>
                      <td>{job.error ? job.error.slice(0, 140) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
