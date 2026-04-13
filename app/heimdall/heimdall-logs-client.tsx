"use client";

import { useState, useMemo } from "react";

type LogEntry = {
  id: string;
  createdAt: string;
  logLevel: string;
  backtrace: string;
  traceType: string;
  traceId: string;
  environment: string;
  host?: string;
  extra?: Record<string, string | number | boolean | null>;
};

type HeimdallLogsClientProps = {
  type: "mbu" | "ssr" | "trace";
  logs: LogEntry[];
};

export function HeimdallLogsClient({ type, logs }: HeimdallLogsClientProps) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesLevel = levelFilter === "all" || log.logLevel === levelFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        log.backtrace.toLowerCase().includes(q) ||
        log.traceId.toLowerCase().includes(q) ||
        log.traceType.toLowerCase().includes(q) ||
        (log.host && log.host.toLowerCase().includes(q)) ||
        (log.extra &&
          Object.values(log.extra).some((v) =>
            String(v ?? "").toLowerCase().includes(q)
          ));
      return matchesLevel && matchesSearch;
    });
  }, [logs, search, levelFilter]);

  const levels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      counts.set(log.logLevel, (counts.get(log.logLevel) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const levelColor = (level: string) => {
    switch (level) {
      case "ERROR":
        return "#dc3545";
      case "WARN":
        return "#fd7e14";
      case "INFO":
        return "#0d6efd";
      case "TRACE":
        return "#6c757d";
      case "DEBUG":
        return "#20c997";
      default:
        return "#6c757d";
    }
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder={`Search ${type === "mbu" ? "MBU" : type === "ssr" ? "Server Side Rules" : "Trace"} logs…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 250px",
            padding: "0.5rem 0.75rem",
            border: "1px solid var(--border, #e0e0e0)",
            borderRadius: "6px",
            fontSize: "0.875rem",
            background: "var(--bg-input, #fff)",
            color: "var(--text, #222)",
          }}
        />

        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setLevelFilter("all")}
            style={{
              padding: "0.35rem 0.65rem",
              borderRadius: "20px",
              border: `1px solid ${levelFilter === "all" ? "#0d6efd" : "var(--border, #e0e0e0)"}`,
              background: levelFilter === "all" ? "#0d6efd" : "transparent",
              color: levelFilter === "all" ? "#fff" : "var(--text, #222)",
              fontSize: "0.75rem",
              cursor: "pointer",
              fontWeight: levelFilter === "all" ? 600 : 400,
            }}
          >
            All ({logs.length})
          </button>
          {levels.map(([level, count]) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              style={{
                padding: "0.35rem 0.65rem",
                borderRadius: "20px",
                border: `1px solid ${levelFilter === level ? levelColor(level) : "var(--border, #e0e0e0)"}`,
                background: levelFilter === level ? levelColor(level) : "transparent",
                color: levelFilter === level ? "#fff" : levelColor(level),
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: levelFilter === level ? 600 : 400,
              }}
            >
              {level} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {search || levelFilter !== "all" ? (
        <p className="muted" style={{ marginBottom: "0.75rem", fontSize: "0.82rem" }}>
          Showing {filteredLogs.length} of {logs.length} logs
          {search && ` matching "${search}"`}
        </p>
      ) : null}

      {/* Log list */}
      {filteredLogs.length === 0 ? (
        <p className="muted" style={{ padding: "1rem 0" }}>
          No logs match the current filters.
        </p>
      ) : (
        <div className="summaries-list">
          {filteredLogs.slice(0, 100).map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <article
                key={log.id}
                className="summary-card"
                style={{ cursor: "pointer" }}
                onClick={() => toggleExpand(log.id)}
              >
                <div className="summary-header">
                  <div className="summary-header-left">
                    <span
                      className="summary-status"
                      style={{
                        background: levelColor(log.logLevel),
                        color: "#fff",
                      }}
                    >
                      {log.logLevel}
                    </span>
                    <span className="summary-project">{log.traceType}</span>
                    {log.extra?.scriptName && (
                      <span className="summary-priority" title={String(log.extra.scriptName)}>
                        {truncate(String(log.extra.scriptName), 35)}
                      </span>
                    )}
                    {log.extra?.resourceType && (
                      <span className="summary-priority" title={String(log.extra.resourceType)}>
                        {truncate(String(log.extra.resourceType), 35)}
                      </span>
                    )}
                  </div>
                  <time className="muted" style={{ fontSize: "0.75rem" }}>
                    {formatDate(log.createdAt)}
                  </time>
                </div>

                <div className="ai-result" style={{ position: "relative" }}>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      margin: 0,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {isExpanded
                      ? log.backtrace
                      : log.backtrace.length > 250
                        ? log.backtrace.slice(0, 250) + "…"
                        : log.backtrace}
                  </p>

                  {/* Extra details for SSR / Trace */}
                  {log.extra && isExpanded && (
                    <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {log.extra.duration && (
                        <span className="ai-confidence" style={{ fontSize: "0.72rem" }}>
                          ⏱ {log.extra.duration}s
                        </span>
                      )}
                      {log.extra.cpuUsage != null && (
                        <span className="ai-confidence" style={{ fontSize: "0.72rem" }}>
                          🖥 CPU: {log.extra.cpuUsage}%
                        </span>
                      )}
                      {log.extra.ramUsage != null && (
                        <span className="ai-confidence" style={{ fontSize: "0.72rem" }}>
                          💾 RAM: {formatBytes(log.extra.ramUsage as number)}
                        </span>
                      )}
                      {log.extra.resourceId != null && (
                        <span className="ai-confidence" style={{ fontSize: "0.72rem" }}>
                          Resource #{log.extra.resourceId}
                        </span>
                      )}
                    </div>
                  )}

                  <span
                    style={{
                      position: "absolute",
                      top: "0.5rem",
                      right: "0.75rem",
                      fontSize: "0.7rem",
                      color: "var(--muted, #888)",
                    }}
                  >
                    {isExpanded ? "▲ collapse" : "▼ expand"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.72rem",
                    color: "var(--muted, #888)",
                    marginTop: "0.5rem",
                    gap: "0.5rem",
                  }}
                >
                  <span>
                    ID: {log.id} · Trace: {log.traceId}
                  </span>
                  <span>
                    {log.host ? truncateHost(log.host) : log.environment}
                  </span>
                </div>
              </article>
            );
          })}
          {filteredLogs.length > 100 && (
            <p className="muted" style={{ padding: "0.5rem 0", textAlign: "center" }}>
              Showing 100 of {filteredLogs.length} logs. Refine your search to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncateHost(host: string): string {
  // Show just the subdomain part: streamline.staging.vodacomsa-battery.nasctech.com -> staging.vodacomsa-battery
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(1, 3).join(".");
}
