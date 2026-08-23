"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n, type I18nContextType } from "@/src/components/I18nProvider";

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

type DedupedWebLog = WebLog & { count: number; firstSeenAt: string };

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

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale);
}

function formatDuration(ms: number | null, t: I18nContextType["t"]): string {
  if (ms === null) return "-";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t("ops.durationSec", { sec });
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return t("ops.durationFormat", { min, rem });
}

function checkPill(ok: boolean): string {
  return ok ? "sync-success" : "sync-failed";
}

export default function OpsPage() {
  const { t, formatDate, locale, formatNumber } = useI18n();
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
      fetch("/api/sync/jobs?limit=10", { cache: "no-store" }),
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
        setError(e instanceof Error ? e.message : t("common.error"));
      } finally {
        setLoading(false);
      }
    })();

    const id = setInterval(() => {
      void loadData().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [t]);

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
      setInfo(t("ops.tokenRevoked"));
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
      setInfo(t("ops.jobCancelled"));
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
      setInfo(t("ops.newIncrementalJob"));
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
  // Repeated client errors (e.g. a retry loop hitting the same failing
  // request) otherwise bury the log with dozens of identical rows. Collapse
  // entries sharing level+source+message+url into one row with a count,
  // keeping the most recent occurrence's timestamp for sorting/display.
  const dedupedLogs = useMemo<DedupedWebLog[]>(() => {
    const groups = new Map<string, DedupedWebLog>();
    for (const log of logs) {
      const key = `${log.level}|${log.source ?? ""}|${log.message}|${log.url ?? ""}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        if (new Date(log.createdAt) > new Date(existing.createdAt)) {
          existing.createdAt = log.createdAt;
        }
        if (new Date(log.createdAt) < new Date(existing.firstSeenAt)) {
          existing.firstSeenAt = log.createdAt;
        }
      } else {
        groups.set(key, { ...log, count: 1, firstSeenAt: log.createdAt });
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [logs]);
  const filteredLogs = useMemo(
    () =>
      logFilter
        ? dedupedLogs.filter(
            (l) =>
              l.message.toLowerCase().includes(logFilter.toLowerCase()) ||
              (l.url ?? "").toLowerCase().includes(logFilter.toLowerCase()) ||
              (l.stack ?? "").toLowerCase().includes(logFilter.toLowerCase()),
          )
        : dedupedLogs,
    [dedupedLogs, logFilter],
  );

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("ops.kicker")}</p>
            <h1>{t("ops.title")}</h1>
            <p className="muted">
              {user ? t("ops.operator", { name: user.displayName, user: user.username }) : t("ops.notSignedIn")}
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={() => void loadData()} disabled={loading}>
              {loading ? t("ops.refreshing") : t("ops.refresh")}
            </button>
            <button type="button" onClick={retryFullSync} disabled={retrying || !user}>
              {retrying ? t("ops.enqueueing") : t("ops.sync24h")}
            </button>
          </div>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {info && <p className="info-banner">{info}</p>}

      {!user && (
        <section className="card">
          <h2>{t("ops.sessionRequired")}</h2>
          <p className="muted">{t("ops.sessionRequiredDesc")}</p>
          <div className="hero-actions">
            <Link href="/" className="primary-link nav-link">
              {t("ops.openDashboard")}
            </Link>
          </div>
        </section>
      )}

      {user && (
        <>
          <section className="ops-grid">
            <article className="card">
              <h2>{t("ops.syncState")}</h2>
              <div className="ops-kv">
                <p><strong>{t("common.status")}:</strong> {syncState?.lastSyncStatus ?? t("ops.statusIdle")}</p>
                <p><strong>{t("ops.runningJob")}:</strong> {syncState?.runningJobId ?? "-"}</p>
                <p><strong>{t("ops.lastIncremental")}:</strong> {formatDateTime(syncState?.lastIncrementalSyncAt ?? null, locale)}</p>
                <p><strong>{t("ops.lastFull")}:</strong> {formatDateTime(syncState?.lastFullSyncAt ?? null, locale)}</p>
                <p><strong>{t("ops.lastError")}:</strong> {syncState?.lastError ?? "-"}</p>
              </div>
            </article>

            <article className="card">
              <h2>{t("ops.jobSnapshot")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.runningPending")}:</strong> {runningJobs}</p>
                <p><strong>{t("ops.failedWindow")}:</strong> {failedJobs}</p>
                <p><strong>{t("ops.latestJob")}:</strong> {latestJob?.id ?? "-"}</p>
                <p><strong>{t("ops.latestType")}:</strong> {latestJob?.jobType ?? "-"}</p>
                <p><strong>{t("ops.latestStatus")}:</strong> {latestJob?.status ?? "-"}</p>
                <p><strong>{t("ops.latestDuration")}:</strong> {formatDuration(latestJob?.durationMs ?? null, t)}</p>
              </div>
            </article>
          </section>

          <section className="ops-grid">
            <article className="card">
              <h2>{t("ops.healthChecks")}</h2>
              <div className="health-grid">
                <div className="health-row">
                  <span>{t("ops.checkOverall")}</span>
                  <span className={`sync-pill ${checkPill(health?.status === "ok")}`}>{health?.status ?? t("ops.unknown")}</span>
                </div>
                <div className="health-row">
                  <span>{t("ops.checkDatabase")}</span>
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks?.database?.ok))}`}>
                    {health?.checks?.database?.ok ? t("ops.ok") : t("ops.failed")}
                  </span>
                </div>
                <div className="health-row">
                  <span>{t("ops.checkRedmine")}</span>
                  <span className={`sync-pill ${checkPill(Boolean(health?.checks?.redmine?.ok || health?.checks?.redmine?.mode === "skipped"))}`}>
                    {health?.checks?.redmine?.mode === "skipped" ? t("ops.skipped") : health?.checks?.redmine?.ok ? t("ops.ok") : t("ops.failed")}
                  </span>
                </div>
                <div className="health-row">
                  <span>{t("ops.checkStale")}</span>
                  <span>{health?.checks?.scheduler?.staleRunningJobs ?? "-"}</span>
                </div>
              </div>
              <p className="muted ops-note">
                {t("ops.checkedAt", { date: health?.timestamp ? formatDate(health.timestamp) : "-" })}
                {health?.checks?.redmine?.error ? ` Redmine error: ${health.checks.redmine.error}` : ""}
                {health?.checks?.database?.error ? ` DB error: ${health.checks.database.error}` : ""}
              </p>
            </article>

            <article className="card">
              <h2>{t("ops.pollerLeader")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.owner")}:</strong> {health?.checks?.scheduler?.lock?.ownerId ?? "-"}</p>
                <p><strong>{t("ops.heartbeat")}:</strong> {formatDateTime(health?.checks?.scheduler?.lock?.heartbeatAt ?? null, locale)}</p>
                <p><strong>{t("ops.expires")}:</strong> {formatDateTime(health?.checks?.scheduler?.lock?.expiresAt ?? null, locale)}</p>
              </div>
            </article>

            <article className="card">
              <h2>{t("ops.logPoller")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.enabled")}:</strong> {health?.checks?.logPoller?.enabled ? t("common.yes") : t("common.no")}</p>
                <p><strong>{t("ops.owner")}:</strong> {health?.checks?.logPoller?.leaderLockOwnerId ?? "-"}</p>
                <p><strong>{t("ops.heartbeat")}:</strong> {formatDateTime(health?.checks?.logPoller?.heartbeatAt ?? null, locale)}</p>
                <p><strong>{t("ops.expires")}:</strong> {formatDateTime(health?.checks?.logPoller?.expiresAt ?? null, locale)}</p>
              </div>
            </article>
          </section>

          <section className="ops-grid">
            <article className="card">
              <h2>{t("ops.sysMetrics")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.version")}:</strong> {health?.version ?? "-"}</p>
                <p><strong>{t("ops.environment")}:</strong> {health?.environment ?? "-"}</p>
                <p><strong>{t("ops.uptime")}:</strong> {health?.uptime ? `${Math.floor(health.uptime / 86400)}d ${Math.floor((health.uptime % 86400) / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m` : "-"}</p>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <Link href="/ops/audit-logs" className="secondary-button">
                  {t("ops.viewAuditLogs")}
                </Link>
                <Link href="/ops/users" className="secondary-button" style={{ marginLeft: '0.5rem' }}>
                  {t("ops.userManagement")}
                </Link>
                <Link href="/ops/recurring-tickets" className="secondary-button" style={{ marginLeft: '0.5rem' }}>
                  {t("recurringTickets.title")}
                </Link>
              </div>
            </article>

            <article className="card">
              <h2>{t("ops.dataMetrics")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.issues")}:</strong> {typeof health?.checks?.metrics?.issues === "number" ? formatNumber(health.checks.metrics.issues) : "-"}</p>
                <p><strong>{t("ops.users")}:</strong> {health?.checks?.metrics?.users ?? "-"}</p>
                <p><strong>{t("ops.activeUsers")}:</strong> {health?.checks?.metrics?.activeUsers ?? "-"}</p>
                <p><strong>{t("ops.internalNotes")}:</strong> {typeof health?.checks?.metrics?.internalNotes === "number" ? formatNumber(health.checks.metrics.internalNotes) : "-"}</p>
              </div>
            </article>

            <article className="card">
              <h2>{t("ops.activityMetrics")}</h2>
              <div className="ops-kv">
                <p><strong>{t("ops.syncJobsCount")}:</strong> {health?.checks?.metrics?.syncJobs ?? "-"}</p>
                <p><strong>{t("ops.auditLogsCount")}:</strong> {typeof health?.checks?.metrics?.auditLogs24h === "number" ? formatNumber(health.checks.metrics.auditLogs24h) : "-"}</p>
                <p><strong>{t("ops.webLogsCount")}:</strong> {typeof health?.checks?.metrics?.webLogs24h === "number" ? formatNumber(health.checks.metrics.webLogs24h) : "-"}</p>
              </div>
            </article>
          </section>

          <section className="card">
            <div className="table-toolbar">
              <h2>{t("ops.recentJobs")}</h2>
              <p className="muted">{t("ops.lastJobs", { count: jobs.length })}</p>
            </div>
            <div className="drill-table-wrap">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>{t("ops.colJobId")}</th>
                    <th>{t("ops.colType")}</th>
                    <th>{t("ops.colStatus")}</th>
                    <th>{t("ops.colStarted")}</th>
                    <th>{t("ops.colEnded")}</th>
                    <th>{t("ops.colDuration")}</th>
                    <th>{t("ops.colError")}</th>
                    <th>{t("ops.colActions")}</th>
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
                      <td>{formatDateTime(job.startedAt, locale)}</td>
                      <td>{formatDateTime(job.endedAt, locale)}</td>
                      <td>{formatDuration(job.durationMs, t)}</td>
                      <td>{job.error ? job.error.slice(0, 140) : "-"}</td>
                      <td>
                        {job.status === 'running' && job.startedAt && Date.now() - new Date(job.startedAt).getTime() > 600000 ? (
                          <button
                            className="secondary-button"
                            onClick={() => cancelJob(job.id)}
                            disabled={cancelling === job.id}
                          >
                            {cancelling === job.id ? t("ops.cancelling") : t("ops.cancel")}
                          </button>
                        ) : job.status === 'failed' ? (
                          <button
                            className="secondary-button"
                            onClick={() => restartJob(job.id)}
                            disabled={restarting === job.id}
                          >
                            {restarting === job.id ? t("ops.restarting") : t("ops.restart")}
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
              <h2>{t("ops.webLogs")}</h2>
              <div className="toolbar-right">
                <span className="muted">{t("ops.rowsInfo", { filtered: filteredLogs.length, total: logs.length, errors: errorLogs })}</span>
                <input
                  type="text"
                  placeholder={t("ops.filterPlaceholder")}
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="log-filter-input"
                />
              </div>
            </div>
            <div className="logs-list">
              {filteredLogs.length === 0 && (
                <p className="muted">{t(logFilter ? "ops.noLogsMatching" : "ops.noLogs")}.</p>
              )}
              {filteredLogs.map((log) => (
                <article key={log.id} className={`log-entry log-${log.level}`}>
                  <div className="log-head">
                    <span className={`log-level-badge log-${log.level}`}>{log.level}</span>
                    <span className="log-source">{log.source ?? t("ops.unknown")}</span>
                    {log.count > 1 && (
                      <span className="log-count-badge" title={t("ops.repeatedSince", { date: new Date(log.firstSeenAt).toLocaleString(locale) })}>
                        ×{log.count}
                      </span>
                    )}
                    <span className="log-time">{new Date(log.createdAt).toLocaleString(locale)}</span>
                  </div>
                  <div className="log-message">{log.message}</div>
                  {log.url && (
                    <div className="log-url">{log.url}</div>
                  )}
                  {log.stack && (
                    <details className="log-stack">
                      <summary>{t("ops.stackTrace")}</summary>
                      <pre>{log.stack}</pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="table-toolbar">
              <h2>{t("ops.mobileTokens")}</h2>
              <p className="muted">{t("ops.activeCount", { count: mobileTokens.length })}</p>
            </div>
            <div className="drill-table-wrap">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>{t("ops.colName")}</th>
                    <th>{t("ops.colPrefix")}</th>
                    <th>{t("ops.colStarted")}</th>
                    <th>{t("common.updated") || "Updated"}</th>
                    <th>{t("ops.colDuration")}</th>
                    <th>{t("ops.colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mobileTokens.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">{t("ops.noActiveMobileTokens")}</td>
                    </tr>
                  )}
                  {mobileTokens.map((token) => (
                    <tr key={token.id}>
                      <td>{token.name ?? "-"}</td>
                      <td>{token.tokenPrefix}</td>
                      <td>{formatDateTime(token.createdAt, locale)}</td>
                      <td>{formatDateTime(token.lastUsedAt, locale)}</td>
                      <td>{formatDateTime(token.expiresAt, locale)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={revokingTokenId === token.id}
                          onClick={() => void revokeToken(token.id)}
                        >
                          {revokingTokenId === token.id ? t("ops.revoking") : t("ops.revoke")}
                        </button>
                      </td>
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
