"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/src/components/ToastProvider";
import {
  WAKATIME_RANGE_OPTIONS,
  type WakaTimeRange,
} from "@/src/lib/wakatime";
import type { CorrelationResult, ApplyResult } from "@/src/lib/correlation";

type Props = {
  initialData: CorrelationResult;
  initialRange: WakaTimeRange;
  initialStart: string;
  initialEnd: string;
};

function formatHours(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatDecimalHours(seconds: number): string {
  return (seconds / 3600).toFixed(1);
}

export function CorrelationClient({ initialData, initialRange, initialStart, initialEnd }: Props) {
  const toast = useToast();
  const [data, setData] = useState<CorrelationResult>(initialData);
  const [range, setRange] = useState<WakaTimeRange>(initialRange);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ApplyResult | null>(null);
  const [lastApply, setLastApply] = useState<ApplyResult | null>(null);

  async function fetchCorrelation(newRange: WakaTimeRange) {
    setBusy(true);
    setPreview(null);
    setLastApply(null);
    try {
      const res = await fetch(`/api/correlation?range=${newRange}`);
      if (!res.ok) throw new Error("Failed to fetch correlation");
      const body = await res.json();
      setData({ matched: body.matched, unmatched: body.unmatched });
      setRange(newRange);
      setStart(body.start);
      setEnd(body.end);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    try {
      const res = await fetch("/api/correlation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, dryRun: true }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const result: ApplyResult = await res.json();
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    setBusy(true);
    try {
      const res = await fetch("/api/correlation/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end }),
      });
      if (!res.ok) throw new Error("Apply failed");
      const result: ApplyResult = await res.json();
      setLastApply(result);
      setPreview(null);
      toast.success(
        result.created > 0
          ? `Logged ${result.totalHours.toFixed(1)}h across ${result.created} entries`
          : "Nothing to apply — all dates already logged",
      );
      // Refresh data to reflect new logged state
      await fetchCorrelation(range);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  const totalMatchedSeconds = data.matched.reduce((s, r) => s + r.totalSeconds, 0);
  const totalUnmatchedSeconds = data.unmatched.reduce((s, r) => s + r.totalSeconds, 0);
  const pendingDays = data.matched.reduce(
    (count, r) => count + r.perDay.filter((d) => !r.alreadyLoggedDates.includes(d.date)).length,
    0,
  );

  const selectedLabel = WAKATIME_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range;

  return (
    <>
      {/* Range picker */}
      <section className="card reports-filters-panel">
        <div className="reports-head">
          <div>
            <h2>Report Window</h2>
            <p className="muted">{selectedLabel} · {start} → {end}</p>
          </div>
          <div className="window-toggle" role="tablist" aria-label="Correlation range">
            {WAKATIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={range === option.value}
                className={`window-btn ${range === option.value ? "active" : ""}`}
                onClick={() => fetchCorrelation(option.value)}
                disabled={busy}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Summary stats */}
      <div className="reports-stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card stat-card">
          <div className="stat-label">Matched Projects</div>
          <div className="stat-value">{data.matched.length}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Matched Hours</div>
          <div className="stat-value">{formatDecimalHours(totalMatchedSeconds)}h</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Pending Days</div>
          <div className="stat-value">{pendingDays}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Unmatched Projects</div>
          <div className="stat-value">{data.unmatched.length}</div>
        </div>
      </div>

      {/* Matched table */}
      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>✅ Matched Tickets</h2>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || pendingDays === 0}
              onClick={handlePreview}
            >
              {busy ? "Loading..." : "Preview"}
            </button>
            {preview && preview.created > 0 && (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={handleApply}
              >
                Apply {preview.created} entries ({preview.totalHours.toFixed(1)}h)
              </button>
            )}
          </div>
        </div>

        {data.matched.length === 0 ? (
          <p className="muted">
            No matches found. Link a GitHub repo to a personal ticket to enable correlation.
          </p>
        ) : (
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Repo</th>
                <th>WakaTime Hours</th>
                <th>Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.matched.map((row) => {
                const pending = row.perDay.filter((d) => !row.alreadyLoggedDates.includes(d.date));
                const logged = row.perDay.filter((d) => row.alreadyLoggedDates.includes(d.date));
                return (
                  <tr key={row.ticketId}>
                    <td>
                      <Link href={`/issues/${row.ticketId}`} style={{ fontWeight: 500 }}>
                        L-{row.localIssueNumber} {row.subject}
                      </Link>
                    </td>
                    <td>
                      <a
                        href={`https://github.com/${row.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="muted"
                      >
                        {row.repo}
                      </a>
                    </td>
                    <td>{formatHours(row.totalSeconds)}</td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                        {row.perDay.map((d) => (
                          <span
                            key={d.date}
                            className={`badge ${row.alreadyLoggedDates.includes(d.date) ? "badge-success" : "badge-warning"}`}
                            title={`${d.date}: ${formatHours(d.seconds)} ${row.alreadyLoggedDates.includes(d.date) ? "(logged)" : "(pending)"}`}
                          >
                            {d.date.slice(5)} {formatHours(d.seconds)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {logged.length > 0 && pending.length === 0 && (
                        <span className="badge badge-success">All logged</span>
                      )}
                      {pending.length > 0 && (
                        <span className="badge badge-warning">{pending.length} pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Preview / last apply summary */}
        {preview && (
          <div className="card" style={{ marginTop: "1rem", background: "var(--bg-muted, #f5f5f5)", padding: "1rem" }}>
            <h3>Preview: {preview.created} new entries, {preview.skipped} skipped, {preview.totalHours.toFixed(1)}h total</h3>
            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
              {preview.entries.map((e, i) => (
                <li key={i}>{e.date}: {e.hours}h → ticket {e.ticketId.slice(0, 8)}…</li>
              ))}
            </ul>
          </div>
        )}
        {lastApply && (
          <div className="card" style={{ marginTop: "1rem", background: "var(--bg-success, #e6ffe6)", padding: "1rem" }}>
            <strong>Applied:</strong> {lastApply.created} entries, {lastApply.totalHours.toFixed(1)}h logged
          </div>
        )}
      </section>

      {/* Unmatched */}
      {data.unmatched.length > 0 && (
        <section className="card">
          <h2>❓ Unmatched WakaTime Projects</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            These WakaTime projects have no matching personal ticket with a GitHub link. Add a repo link to a ticket to include them.
          </p>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Hours</th>
                <th>Days Active</th>
              </tr>
            </thead>
            <tbody>
              {data.unmatched
                .sort((a, b) => b.totalSeconds - a.totalSeconds)
                .map((u) => (
                  <tr key={u.project}>
                    <td>{u.project}</td>
                    <td>{formatHours(u.totalSeconds)}</td>
                    <td>{u.perDay.length}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            Total unmatched: {formatDecimalHours(totalUnmatchedSeconds)}h
          </p>
        </section>
      )}
    </>
  );
}
