"use client";

import React from "react";
import { HeimdallHeader } from "./heimdall-header";
import { StatCard, StackedBarChart } from "@/src/components/reports/charts";
import { HeimdallLogsClient } from "./heimdall-logs-client";
import { useI18n } from "@/src/components/I18nProvider";

interface HeimdallDashboardViewProps {
  totalLogs: number;
  errorCount: number;
  hostCount: number;
  mbuLogs: any[];
  ssrLogs: any[];
  traces: any[];
  trendDates: string[];
  mbuTrend: number[];
  ssrTrend: number[];
  traceTrend: number[];
  mbuByLevel: [string, number][];
  ssrByStatus: [string, number][];
  traceByLevel: [string, number][];
  topScripts: [string, number][];
  allErrors: any[];
}

export function HeimdallDashboardView({
  totalLogs,
  errorCount,
  hostCount,
  mbuLogs,
  ssrLogs,
  traces,
  trendDates,
  mbuTrend,
  ssrTrend,
  traceTrend,
  mbuByLevel,
  ssrByStatus,
  traceByLevel,
  topScripts,
  allErrors,
}: HeimdallDashboardViewProps) {
  const { t } = useI18n();

  return (
    <main className="dashboard reports-v2 heimdall-dashboard">
      <HeimdallHeader
        totalLogs={totalLogs}
        errorCount={errorCount}
        hostCount={hostCount}
      />

      {totalLogs === 0 ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>{t("heimdall.noLogsTitle")}</h2>
              <p className="muted">
                {t("heimdall.noLogsDesc")}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="reports-stats-grid reports-stats-grid--four">
            <StatCard
              label={t("heimdall.statMbu")}
              value={mbuLogs.length}
              foot={`${mbuLogs.filter((l: any) => l.logLevel === "ERROR" || l.logLevel === "WARN").length} errors/warnings · ${hostCount} hosts`}
              icon="📋"
              tone="info"
            />
            <StatCard
              label={t("heimdall.statSsr")}
              value={ssrLogs.length}
              foot={`${ssrLogs.filter((l: any) => l.isError).length} failed jobs`}
              icon="⚙️"
              tone="success"
            />
            <StatCard
              label={t("heimdall.statTraces")}
              value={traces.length}
              foot={`${traces.filter((l: any) => l.logLevel === "ERROR" || l.logLevel === "WARN").length} errors/warnings`}
              icon="📡"
              tone="success"
            />
            <StatCard
              label={t("heimdall.statErrors")}
              value={errorCount}
              foot={`${allErrors.filter(e => e._source === 'mbu_logs').length} MBU · ${ssrLogs.filter((l: any) => l.isError).length} SSR · ${allErrors.filter(e => e._source === 'traces').length} Trace`}
              icon="⚠️"
              tone="danger"
            />
          </div>

          {/* Trend Count Report */}
          <section className="card">
            <details className="collapsible-section" open>
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>{t("heimdall.trendTitle")}</h2>
                  <p className="muted">{t("heimdall.trendDesc")}</p>
                </div>
              </summary>

              <div className="ai-overview">
                <StackedBarChart
                  showValue
                  series={[
                    { name: t("heimdall.statMbu"), data: trendDates.map((date, i) => ({
                      label: date,
                      value: mbuTrend[i],
                    })) },
                    { name: t("heimdall.statSsr"), data: trendDates.map((date, i) => ({
                      label: date,
                      value: ssrTrend[i],
                    })) },
                    { name: t("heimdall.statTraces"), data: trendDates.map((date, i) => ({
                      label: date,
                      value: traceTrend[i],
                    })) }
                  ]}
                  colors={['#006d77', '#10b981', '#f59e0b']}
                />
              </div>
            </details>
          </section>

          {/* Overview Charts */}
          <section className="ai-overview">
            <div className="ai-overview-grid">
              <div className="ai-overview-card">
                <h4>{t("heimdall.mbuLevelsTitle")}</h4>
                {mbuByLevel.length === 0 ? (
                  <p className="muted">{t("heimdall.noMbuLogs")}</p>
                ) : (
                  <div className="ai-list">
                    {mbuByLevel.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <span className="ai-list-name">{name}</span>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ai-overview-card">
                <h4>{t("heimdall.ssrStatusTitle")}</h4>
                {ssrByStatus.length === 0 ? (
                  <p className="muted">{t("heimdall.noSsrLogs")}</p>
                ) : (
                  <div className="ai-list">
                    {ssrByStatus.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <span className="ai-list-name">{name}</span>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ai-overview-card">
                <h4>{t("heimdall.traceLevelsTitle")}</h4>
                {traceByLevel.length === 0 ? (
                  <p className="muted">{t("heimdall.noTraces")}</p>
                ) : (
                  <div className="ai-list">
                    {traceByLevel.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <span className="ai-list-name">{name}</span>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ai-overview-card heimdall-top-scripts-card">
                <h4>{t("heimdall.topScriptsTitle")}</h4>
                {topScripts.length === 0 ? (
                  <p className="muted">{t("heimdall.noScripts")}</p>
                ) : (
                  <div className="ai-list heimdall-top-scripts-list">
                    {topScripts.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <span className="ai-list-name" title={name}>
                          {name}
                        </span>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Errors & Warnings */}
          {allErrors.length > 0 && (
            <section className="card">
              <details className="collapsible-section" open>
                <summary className="collapsible-summary">
                  <div className="collapsible-head">
                    <h2>{t("heimdall.errorsTitle")}</h2>
                    <p className="muted">
                      {t("heimdall.errorsDesc", { count: errorCount })}
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
                          {new Date(err.createdAt).toLocaleString()}
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
                      {t("heimdall.showingXofY", { count: 50, total: allErrors.length })}
                    </p>
                  )}
                </div>
              </details>
            </section>
          )}

          {/* Logs Sections */}
          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>{t("heimdall.statMbu")}</h2>
                  <p className="muted">{mbuLogs.length} records</p>
                </div>
              </summary>
              <HeimdallLogsClient
                type="mbu"
                logs={mbuLogs.map(l => ({ ...l, id: l.id.toString(), createdAt: new Date(l.createdAt).toISOString() }))}
              />
            </details>
          </section>

          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>{t("heimdall.statSsr")}</h2>
                  <p className="muted">{ssrLogs.length} records</p>
                </div>
              </summary>
              <HeimdallLogsClient
                type="ssr"
                logs={ssrLogs.map(l => ({
                   id: l.id.toString(),
                   createdAt: new Date(l.createdAt).toISOString(),
                   logLevel: l.isError ? "ERROR" : "INFO",
                   backtrace: `${l.scriptName} — ${l.status}${l.errorDescr ? ` — ${l.errorDescr}` : ""}`,
                   traceType: l.status,
                   traceId: l.requestId || "",
                   environment: l.environment,
                   host: l.host,
                   extra: { ...l, duration: l.duration.toString() }
                }))}
              />
            </details>
          </section>

          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>{t("heimdall.statTraces")}</h2>
                  <p className="muted">{traces.length} records</p>
                </div>
              </summary>
              <HeimdallLogsClient
                type="trace"
                logs={traces.map(l => ({
                  ...l,
                  id: l.id.toString(),
                  createdAt: new Date(l.createdAt).toISOString(),
                  traceId: l.traceId.toString()
                }))}
              />
            </details>
          </section>
        </>
      )}
    </main>
  );
}
