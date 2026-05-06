"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";

export type HeimdallErrorEntry = {
  _source: string;
  id: string;
  level: string;
  message: string;
  createdAt: string;
};

type HeimdallErrorsListProps = {
  errors: HeimdallErrorEntry[];
};

export function HeimdallErrorsList({ errors }: HeimdallErrorsListProps) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const { t } = useI18n();

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const err of errors) {
      counts.set(err._source, (counts.get(err._source) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [errors]);

  const filteredErrors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return errors.filter((err) => {
      const matchesSource = sourceFilter === "all" || err._source === sourceFilter;
      const matchesSearch =
        !q ||
        err.message.toLowerCase().includes(q) ||
        err.level.toLowerCase().includes(q) ||
        err._source.toLowerCase().includes(q) ||
        err.id.toLowerCase().includes(q);
      return matchesSource && matchesSearch;
    });
  }, [errors, search, sourceFilter]);

  const visibleErrors = filteredErrors.slice(0, 100);

  return (
    <div className="heimdall-errors-list">
      <div className="heimdall-error-filters">
        <input
          type="search"
          placeholder="Search errors and warnings..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="heimdall-error-source-tabs">
          <button
            type="button"
            className={sourceFilter === "all" ? "active" : ""}
            onClick={() => setSourceFilter("all")}
          >
            All ({errors.length})
          </button>
          {sources.map(([source, count]) => (
            <button
              key={source}
              type="button"
              className={sourceFilter === source ? "active" : ""}
              onClick={() => setSourceFilter(source)}
            >
              {sourceLabel(source)} ({count})
            </button>
          ))}
        </div>
      </div>

      <p className="muted heimdall-error-count">
        {t("heimdall.showingXofY", { count: visibleErrors.length, total: filteredErrors.length })}
        {search.trim() && t("heimdall.matchingSearch", { search: search.trim() })}
      </p>

      {visibleErrors.length === 0 ? (
        <p className="muted" style={{ padding: "1rem 0" }}>
          {t("heimdall.noLogsMatch")}
        </p>
      ) : (
        <div className="summaries-list">
          {visibleErrors.map((err) => (
            <article key={`${err._source}-${err.id}`} className="summary-card">
              <div className="summary-header">
                <div className="summary-header-left">
                  <span className={`summary-status ${err.level === "ERROR" ? "summary-status--danger" : "summary-status--warning"}`}>
                    {err.level}
                  </span>
                  <span className="summary-project">{sourceLabel(err._source)}</span>
                </div>
                <time className="muted">
                  {new Date(err.createdAt).toLocaleString()}
                </time>
              </div>
              <div className="ai-result">
                <pre className="ai-section">
                  {err.message.length > 800 ? `${err.message.slice(0, 800)}...` : err.message}
                </pre>
              </div>
            </article>
          ))}
          {filteredErrors.length > visibleErrors.length && (
            <p className="muted" style={{ padding: "0.5rem 0" }}>
              {t("heimdall.showingXofY", { count: visibleErrors.length, total: filteredErrors.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === "mbu_logs") return "MBU";
  if (source === "server_side_rules_log") return "SSR";
  if (source === "traces") return "Trace";
  return source;
}
