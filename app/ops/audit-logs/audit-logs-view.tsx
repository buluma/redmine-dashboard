"use client";

import React, { useMemo, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";

interface AuditLog {
  id: string;
  createdAt: string | Date;
  userEmail?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  ipAddress?: string | null;
  changes?: unknown;
  metadata?: unknown;
}

interface AuditLogsViewProps {
  auditLogs: AuditLog[];
  stats: {
    total: number;
    creates: number;
    updates: number;
    deletes: number;
    today: number;
    uniqueUsers: number;
  };
}

function getActionClass(action: string): string {
  switch (action) {
    case "CREATE": return "sync-success";
    case "UPDATE": return "status-chip";
    case "DELETE": return "sync-failed";
    default: return "";
  }
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Always quote so commas/newlines/double-quotes inside the value cannot
  // break out into adjacent columns.
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[]): void {
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AuditLogsView({ auditLogs, stats }: AuditLogsViewProps) {
  const { t, formatDate } = useI18n();

  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const entityOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const log of auditLogs) {
      if (log.entityType) seen.add(log.entityType);
    }
    return Array.from(seen).sort();
  }, [auditLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (entityFilter !== "all" && log.entityType !== entityFilter) return false;
      if (q) {
        const hay = [log.userEmail, log.userId, log.entityId, log.ipAddress]
          .filter((v): v is string | number => v != null)
          .map((v) => String(v).toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, actionFilter, entityFilter, search]);

  function handleExport() {
    const header = ["timestamp", "user", "action", "entityType", "entityId", "ipAddress", "changes", "metadata"];
    const rows = [
      header.map(csvCell).join(","),
      ...filtered.map((log) =>
        [
          formatDate(log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt)),
          log.userEmail ?? log.userId ?? "",
          log.action,
          log.entityType,
          log.entityId ?? "",
          log.ipAddress ?? "",
          log.changes ?? "",
          log.metadata ?? "",
        ].map(csvCell).join(","),
      ),
    ];
    downloadCsv(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
            <p><strong>Showing:</strong> {t("ops.todayEvents", { count: filtered.length })} / {auditLogs.length}</p>
            <p><strong>{t("ops.uniqueUsers")}:</strong> {stats.uniqueUsers}</p>
          </div>
        </article>
      </section>

      {/* Filter bar */}
      <section className="card">
        <div className="filters-bar filters-bar-compact" role="region" aria-label="Audit log filters">
          <label className="inline-field">
            Action
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="inline-field">
            Entity
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="all">All</option>
              {entityOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="inline-field" style={{ flex: "1 1 220px" }}>
            Search
            <input
              type="text"
              placeholder="User, IP, or entity ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" onClick={handleExport}>
            Export CSV ({filtered.length})
          </button>
        </div>
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">{t("ops.noAuditLogs")}</td>
                </tr>
              )}
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt))}</td>
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
      {filtered.some(l => l.changes || l.metadata) && (
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
                {filtered.filter(l => l.changes || l.metadata).map((log) => (
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
