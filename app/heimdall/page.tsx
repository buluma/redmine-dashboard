import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { HeimdallLogsClient } from "./heimdall-logs-client";
import { HeimdallHeader } from "./heimdall-header";

export const runtime = "nodejs";

export default async function HeimdallPage() {
  // Graceful auth: redirect to login if no session
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    redirect("/");
  }

  // Fetch MBU logs
  const mbuLogs = await prisma.mbuLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Fetch server side rules logs
  const serverSideRulesLogs = await prisma.serverSideRulesLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Fetch traces
  const traces = await prisma.trace.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Compute stats
  const totalLogs = mbuLogs.length + serverSideRulesLogs.length + traces.length;

  // Extract unique hosts
  const allHosts = Array.from(new Set([
    ...mbuLogs.map((l) => l.host),
    ...serverSideRulesLogs.map((l) => l.host),
    ...traces.map((l) => l.host),
  ])).sort();

  // MBU log stats
  const mbuByLevel = new Map<string, number>();
  const mbuByType = new Map<string, number>();
  for (const log of mbuLogs) {
    mbuByLevel.set(log.logLevel, (mbuByLevel.get(log.logLevel) ?? 0) + 1);
    mbuByType.set(log.traceType, (mbuByType.get(log.traceType) ?? 0) + 1);
  }

  // Server side rules stats
  const ssrByStatus = new Map<string, number>();
  const ssrErrors = serverSideRulesLogs.filter((l) => l.isError);
  const ssrByScript = new Map<string, number>();
  for (const log of serverSideRulesLogs) {
    ssrByStatus.set(log.status, (ssrByStatus.get(log.status) ?? 0) + 1);
    ssrByScript.set(log.scriptName, (ssrByScript.get(log.scriptName) ?? 0) + 1);
  }
  const topScripts = Array.from(ssrByScript.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Trace stats
  const traceByLevel = new Map<string, number>();
  const traceByResource = new Map<string, number>();
  for (const log of traces) {
    traceByLevel.set(log.logLevel, (traceByLevel.get(log.logLevel) ?? 0) + 1);
    if (log.resourceType) {
      traceByResource.set(log.resourceType, (traceByResource.get(log.resourceType) ?? 0) + 1);
    }
  }
  const topResources = Array.from(traceByResource.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Error logs across all tables — normalized to a common shape
  const mbuErrors = mbuLogs.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");
  const traceErrors = traces.filter((l) => l.logLevel === "ERROR" || l.logLevel === "WARN");

  type ErrorEntry = {
    _source: string;
    id: string;
    level: string;
    message: string;
    createdAt: Date;
  };

  const allErrors: ErrorEntry[] = [
    ...mbuErrors.map((l) => ({
      _source: "mbu_logs",
      id: l.id.toString(),
      level: l.logLevel,
      message: l.backtrace,
      createdAt: l.createdAt,
    })),
    ...ssrErrors.map((l) => ({
      _source: "server_side_rules_log",
      id: l.id.toString(),
      level: "ERROR",
      message: `${l.scriptName} — ${l.errorDescr || l.status}`,
      createdAt: l.createdAt,
    })),
    ...traceErrors.map((l) => ({
      _source: "traces",
      id: l.id.toString(),
      level: l.logLevel,
      message: l.backtrace,
      createdAt: l.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <main className="dashboard">
      <HeimdallHeader
        totalLogs={totalLogs}
        errorCount={allErrors.length}
        hostCount={allHosts.length}
      />

      {totalLogs === 0 ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>No Logs Imported Yet</h2>
              <p className="muted">
                Fetch logs from Streamline using the Ansible playbooks in{" "}
                <code>debugging/</code>, then import them with{" "}
                <code>node scripts/import-streamline-logs.js</code>.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Overview Cards */}
          <section className="card reports-shell">
            <div className="reports-head">
              <div>
                <h2>Overview</h2>
                <p className="muted">Distribution of imported Streamline logs</p>
              </div>
            </div>

            <div className="reports-grid">
              <article className="report-card">
                <p className="report-label">MBU Logs</p>
                <p className="report-value">{mbuLogs.length}</p>
                <p className="report-foot">
                  {mbuErrors.length} errors/warnings
                </p>
              </article>

              <article className="report-card">
                <p className="report-label">Server Side Rules</p>
                <p className="report-value">{serverSideRulesLogs.length}</p>
                <p className="report-foot">
                  {ssrErrors.length} failed jobs
                </p>
              </article>

              <article className="report-card">
                <p className="report-label">Traces</p>
                <p className="report-value">{traces.length}</p>
                <p className="report-foot">
                  {traceErrors.length} errors/warnings
                </p>
              </article>
            </div>

            <div className="reports-grid">
              <article className="report-card">
                <p className="report-label">MBU Log Levels</p>
                {mbuByLevel.size === 0 && <p className="muted">No MBU logs yet.</p>}
                <div className="reports-list">
                  {Array.from(mbuByLevel.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <div key={name} className="report-list-row">
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                </div>
              </article>

              <article className="report-card">
                <p className="report-label">Server Side Rules — Status</p>
                <div className="reports-list">
                  {Array.from(ssrByStatus.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <div key={name} className="report-list-row">
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                </div>
              </article>

              <article className="report-card">
                <p className="report-label">Trace Log Levels</p>
                {traceByLevel.size === 0 && <p className="muted">No traces yet.</p>}
                <div className="reports-list">
                  {Array.from(traceByLevel.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => (
                      <div key={name} className="report-list-row">
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                </div>
              </article>
            </div>

            {topScripts.length > 0 && (
              <div className="reports-grid">
                <article className="report-card">
                  <p className="report-label">Top Scripts (by execution count)</p>
                  <div className="reports-list">
                    {topScripts.map(([name, count]) => (
                      <div key={name} className="report-list-row">
                        <span title={name}>{name.length > 40 ? name.slice(0, 40) + "…" : name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                {topResources.length > 0 && (
                  <article className="report-card">
                    <p className="report-label">Top Resource Types</p>
                    <div className="reports-list">
                      {topResources.map(([name, count]) => (
                        <div key={name} className="report-list-row">
                          <span title={name}>{name.length > 40 ? name.slice(0, 40) + "…" : name}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                )}

                <article className="report-card">
                  <p className="report-label">Error Summary</p>
                  <p className="report-value">{allErrors.length}</p>
                  <p className="report-foot">
                    {mbuErrors.length} MBU · {ssrErrors.length} SSR · {traceErrors.length} Trace
                  </p>
                </article>
              </div>
            )}
          </section>

          {/* Errors & Warnings */}
          {allErrors.length > 0 && (
            <section className="card">
              <details className="collapsible-section" open>
                <summary className="collapsible-summary">
                  <div className="collapsible-head">
                    <h2>⚠️ Errors & Warnings</h2>
                    <p className="muted">
                      {allErrors.length} issues requiring attention
                    </p>
                  </div>
                </summary>

                <div className="summaries-list">
                  {allErrors.slice(0, 50).map((err) => (
                    <article key={`${err._source}-${err.id}`} className="summary-card">
                      <div className="summary-header">
                        <div className="summary-header-left">
                          <span className={`summary-status ${err.level === "ERROR" ? "summary-status--danger" : "summary-status--warning"}`}>
                            {err.level}
                          </span>
                          <span className="summary-project">{err._source}</span>
                        </div>
                        <time className="muted">
                          {formatDateUTC(err.createdAt)}
                        </time>
                      </div>
                      <div className="ai-result">
                        <pre className="ai-section" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.82rem" }}>
                          {err.message.length > 500 ? err.message.slice(0, 500) + "…" : err.message}
                        </pre>
                      </div>
                    </article>
                  ))}
                  {allErrors.length > 50 && (
                    <p className="muted" style={{ padding: "0.5rem 0" }}>
                      Showing 50 of {allErrors.length} errors/warnings.
                    </p>
                  )}
                </div>
              </details>
            </section>
          )}

          {/* MBU Logs */}
          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>MBU Logs</h2>
                  <p className="muted">
                    {mbuLogs.length} application log entries
                  </p>
                </div>
              </summary>

              <HeimdallLogsClient
                type="mbu"
                logs={mbuLogs.map((l) => ({
                  id: l.id.toString(),
                  createdAt: l.createdAt.toISOString(),
                  logLevel: l.logLevel,
                  backtrace: l.backtrace,
                  traceType: l.traceType,
                  traceId: l.traceId,
                  environment: l.environment,
                  host: l.host,
                }))}
              />
            </details>
          </section>

          {/* Server Side Rules Logs */}
          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>Server Side Rules Logs</h2>
                  <p className="muted">
                    {serverSideRulesLogs.length} scheduled job executions
                  </p>
                </div>
              </summary>

              <HeimdallLogsClient
                type="ssr"
                logs={serverSideRulesLogs.map((l) => ({
                  id: l.id.toString(),
                  createdAt: l.createdAt.toISOString(),
                  logLevel: l.isError ? "ERROR" : "INFO",
                  backtrace: `${l.scriptName} — ${l.status}${l.errorDescr ? ` — ${l.errorDescr}` : ""}`,
                  traceType: l.status,
                  traceId: l.requestId || "",
                  environment: l.environment,
                  host: l.host,
                  extra: {
                    duration: l.duration.toString(),
                    cpuUsage: l.cpuUsage,
                    ramUsage: l.ramUsage,
                    scriptName: l.scriptName,
                    isError: l.isError,
                  },
                }))}
              />
            </details>
          </section>

          {/* Traces */}
          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>Traces</h2>
                  <p className="muted">
                    {traces.length} trace entries
                  </p>
                </div>
              </summary>

              <HeimdallLogsClient
                type="trace"
                logs={traces.map((l) => ({
                  id: l.id.toString(),
                  createdAt: l.createdAt.toISOString(),
                  logLevel: l.logLevel,
                  backtrace: l.backtrace,
                  traceType: l.traceType,
                  traceId: l.traceId.toString(),
                  environment: l.environment,
                  host: l.host,
                  extra: {
                    resourceType: l.resourceType,
                    resourceId: l.resourceId,
                  },
                }))}
              />
            </details>
          </section>
        </>
      )}
    </main>
  );
}

function formatDateUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
