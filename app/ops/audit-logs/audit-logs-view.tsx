"use client";

import React from "react";
import { useI18n } from "@/src/components/I18nProvider";

interface AuditLogsViewProps {
  auditLogs: any[];
  stats: {
    total: number;
    creates: number;
    updates: number;
    deletes: number;
    today: number;
    uniqueUsers: number;
  };
}

export function AuditLogsView({ auditLogs, stats }: AuditLogsViewProps) {
  const { t, formatDate } = useI18n();

  function getActionClass(action: string): string {
    switch (action) {
      case "CREATE": return "sync-success";
      case "UPDATE": return "status-chip";
      case "DELETE": return "sync-failed";
      default: return "";
    }
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("common.operations") || "Operations"}</p>
            <h1>{t("ops.auditLogsTitle")}</h1>
            <p className="muted">{t("ops.auditLogsDesc")}</p>
          </div>
          <div className="hero-actions">
            <a href="/ops" className="secondary-button">
              {t("ops.backToOps")}
            </a>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <section className="ops-grid">
        <article className="card">
          <h2>{t("ops.activity24h")}</h2>
          <div className="ops-kv">
            <p><strong>Today:</strong> {t("ops.todayEvents", { count: stats.today })}</p>
            <p><strong>{t("ops.creates")}:</strong> {stats.creates}</p>
            <p><strong>{t("ops.updates")}:</strong> {stats.updates}</p>
            <p><strong>{t("ops.deletes")}:</strong> {stats.deletes}</p>
          </div>
        </article>

        <article className="card">
          <h2>{t("ops.overview")}</h2>
          <div className="ops-kv">
            <p><strong>Showing:</strong> {t("ops.todayEvents", { count: auditLogs.length })}</p>
            <p><strong>{t("ops.uniqueUsers")}:</strong> {stats.uniqueUsers}</p>
          </div>
        </article>
      </section>

      {/* Audit Logs Table */}
      <section className="card">
        <div className="table-toolbar">
          <h2>{t("ops.recentEvents")}</h2>
        </div>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("ops.colTimestamp")}</th>
                <th>{t("ops.colUser")}</th>
                <th>{t("common.action")}</th>
                <th>{t("ops.colEntity")}</th>
                <th>ID</th>
                <th>{t("ops.colIpAddress")}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">{t("ops.noAuditLogs")}</td>
                </tr>
              )}
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt)}</td>
                  <td>{log.userEmail ?? log.userId ?? "-"}</td>
                  <td>
                    <span className={`status-chip ${getActionClass(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.entityType}</td>
                  <td className="muted">{log.entityId ?? "-"}</td>
                  <td className="muted">{log.ipAddress ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Log Details (expandable) */}
      {auditLogs.some(l => l.changes || l.metadata) && (
        <section className="card">
          <h2>{t("ops.logDetails")}</h2>
          <div className="drill-table-wrap">
            <table className="issues-table">
              <thead>
                <tr>
                  <th>{t("ops.colEntity")}</th>
                  <th>{t("ops.colChanges")}</th>
                  <th>{t("ops.colMetadata")}</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.filter(l => l.changes || l.metadata).map((log) => (
                  <tr key={`detail-${log.id}`}>
                    <td>{log.entityType} #{log.entityId}</td>
                    <td>
                      {log.changes ? (
                        <pre className="code-block">
                          {JSON.stringify(log.changes, null, 2).slice(0, 200)}
                        </pre>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      {log.metadata ? (
                        <pre className="code-block">
                          {JSON.stringify(log.metadata, null, 2).slice(0, 100)}
                        </pre>
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
      )}
    </main>
  );
}
