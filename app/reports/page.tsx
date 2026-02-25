"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  username: string;
  displayName: string;
};

type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  createdOnRemote: string;
};

type TimeEntry = {
  id: string;
  redmineTimeEntryId: number | null;
  hours: number;
  activityId: number;
  activityName: string | null;
  authorName: string | null;
  comments: string | null;
  spentOn: string;
};

type Issue = {
  id: string;
  redmineIssueId: number;
  subject: string;
  projectName: string | null;
  parentIssueId: number | null;
  parentIssueLabel: string | null;
  priority: string | null;
  statusName: string;
  updatedOnRemote: string;
  dueDate: string | null;
  doneRatio: number | null;
  journals: Journal[];
  timeEntries: TimeEntry[];
};

type TrendPoint = {
  key: string;
  label: string;
  value: number;
};

type Drilldown =
  | { type: "status"; value: string }
  | { type: "parent"; value: string }
  | { type: "updated_day"; value: string }
  | { type: "comment_day"; value: string }
  | { type: "timelog_day"; value: string }
  | { type: "activity_day"; value: string }
  | null;

type ActivityEvent = {
  timestamp: string;
  issueId: number;
  issueSubject: string;
  detail: string;
};

function dateKey(dateLike: string | Date): string {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildDayKeys(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(dateKey(d));
  }
  return out;
}

function csvEscape(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replaceAll("\"", "\"\"")}"`;
  }
  return str;
}

function Sparkline({
  points,
  stroke,
  fill,
  activeKey,
  onPointClick,
}: {
  points: TrendPoint[];
  stroke: string;
  fill: string;
  activeKey?: string;
  onPointClick?: (key: string) => void;
}) {
  const width = 320;
  const height = 86;
  const pad = 10;
  const max = Math.max(...points.map((p) => p.value), 1);

  const coords = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
    const y = height - pad - (p.value / max) * (height - pad * 2);
    return { x, y, key: p.key };
  });

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = [
    `${pad},${height - pad}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${width - pad},${height - pad}`,
  ].join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend line">
      <polyline points={area} fill={fill} stroke="none" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      {coords.map((c) => (
        <circle
          key={c.key}
          className={`spark-point ${activeKey === c.key ? "active" : ""}`}
          cx={c.x}
          cy={c.y}
          r={activeKey === c.key ? "4.1" : "2.8"}
          fill={stroke}
          onClick={() => onPointClick?.(c.key)}
        />
      ))}
    </svg>
  );
}

function parentBucket(issue: Issue): string {
  if (!issue.parentIssueId) {
    return "No Parent";
  }
  return `${issue.parentIssueLabel ?? `#${issue.parentIssueId}`} (#${issue.parentIssueId})`;
}

function isClosedStatus(statusName: string): boolean {
  const s = statusName.toLowerCase();
  return s.includes("closed") || s.includes("resolved") || s.includes("done");
}

function activityCountForIssueOnDay(issue: Issue, day: string): number {
  let count = 0;
  if (dateKey(issue.updatedOnRemote) === day) {
    count += 1;
  }
  count += issue.journals.filter((j) => dateKey(j.createdOnRemote) === day).length;
  count += issue.timeEntries.filter((t) => dateKey(t.spentOn) === day).length;
  return count;
}

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendWindowDays, setTrendWindowDays] = useState(14);
  const [drilldown, setDrilldown] = useState<Drilldown>(null);

  async function loadReportData() {
    setError(null);
    const res = await fetch("/api/reports", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Unable to load reports");
    }
    setUser(data.user);
    setIssues(data.items ?? []);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadReportData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load reports");
      } finally {
        setLoading(false);
      }
    })();

    const interval = setInterval(() => {
      void loadReportData().catch(() => {});
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const aggregates = useMemo(() => {
    const byStatus = new Map<string, number>();
    const byParent = new Map<string, number>();

    for (const issue of issues) {
      byStatus.set(issue.statusName, (byStatus.get(issue.statusName) ?? 0) + 1);
      const parent = parentBucket(issue);
      byParent.set(parent, (byParent.get(parent) ?? 0) + 1);
    }

    return {
      byStatus: Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
      byParent: Array.from(byParent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [issues]);

  const reports = useMemo(() => {
    const keys = buildDayKeys(trendWindowDays);
    const heatKeys = buildDayKeys(56);

    const updatesByDay = new Map<string, number>();
    const commentsByDay = new Map<string, number>();
    const hoursByDay = new Map<string, number>();
    const activityByDay = new Map<string, number>();
    const activityFeed: ActivityEvent[] = [];

    for (const key of keys) {
      updatesByDay.set(key, 0);
      commentsByDay.set(key, 0);
      hoursByDay.set(key, 0);
    }
    for (const key of heatKeys) {
      activityByDay.set(key, 0);
    }

    for (const issue of issues) {
      const key = dateKey(issue.updatedOnRemote);
      if (updatesByDay.has(key)) updatesByDay.set(key, (updatesByDay.get(key) ?? 0) + 1);
      if (activityByDay.has(key)) activityByDay.set(key, (activityByDay.get(key) ?? 0) + 1);

      activityFeed.push({
        timestamp: issue.updatedOnRemote,
        issueId: issue.redmineIssueId,
        issueSubject: issue.subject,
        detail: `Issue updated (${issue.statusName})`,
      });

      for (const journal of issue.journals) {
        const journalKey = dateKey(journal.createdOnRemote);
        if (commentsByDay.has(journalKey)) {
          commentsByDay.set(journalKey, (commentsByDay.get(journalKey) ?? 0) + 1);
        }
        if (activityByDay.has(journalKey)) {
          activityByDay.set(journalKey, (activityByDay.get(journalKey) ?? 0) + 1);
        }

        activityFeed.push({
          timestamp: journal.createdOnRemote,
          issueId: issue.redmineIssueId,
          issueSubject: issue.subject,
          detail: `${journal.author ?? "Unknown"} commented`,
        });
      }

      for (const entry of issue.timeEntries) {
        const entryKey = dateKey(entry.spentOn);
        if (hoursByDay.has(entryKey)) {
          hoursByDay.set(entryKey, Number((hoursByDay.get(entryKey) ?? 0) + entry.hours));
        }
        if (activityByDay.has(entryKey)) {
          activityByDay.set(entryKey, (activityByDay.get(entryKey) ?? 0) + 1);
        }

        activityFeed.push({
          timestamp: entry.spentOn,
          issueId: issue.redmineIssueId,
          issueSubject: issue.subject,
          detail: `${entry.hours.toFixed(1)}h logged${entry.activityName ? ` (${entry.activityName})` : ""}`,
        });
      }
    }

    const issueUpdateTrend = keys.map((entryKey) => ({ key: entryKey, label: formatDayLabel(entryKey), value: updatesByDay.get(entryKey) ?? 0 }));
    const commentTrend = keys.map((entryKey) => ({ key: entryKey, label: formatDayLabel(entryKey), value: commentsByDay.get(entryKey) ?? 0 }));
    const hourTrend = keys.map((entryKey) => ({
      key: entryKey,
      label: formatDayLabel(entryKey),
      value: Number((hoursByDay.get(entryKey) ?? 0).toFixed(1)),
    }));

    const updatesTotal = issueUpdateTrend.reduce((sum, p) => sum + p.value, 0);
    const commentsTotal = commentTrend.reduce((sum, p) => sum + p.value, 0);
    const hoursTotal = Number(hourTrend.reduce((sum, p) => sum + p.value, 0).toFixed(1));

    const peakUpdates = issueUpdateTrend.reduce((acc, p) => (p.value > acc.value ? p : acc), {
      key: "-",
      label: "-",
      value: 0,
    });
    const peakComments = commentTrend.reduce((acc, p) => (p.value > acc.value ? p : acc), {
      key: "-",
      label: "-",
      value: 0,
    });
    const peakHours = hourTrend.reduce((acc, p) => (p.value > acc.value ? p : acc), {
      key: "-",
      label: "-",
      value: 0,
    });

    const overdueByParent = new Map<string, number>();
    for (const issue of issues) {
      if (!issue.dueDate) continue;
      if (new Date(issue.dueDate).getTime() >= new Date().setHours(0, 0, 0, 0)) continue;
      if (isClosedStatus(issue.statusName)) continue;

      const parent = parentBucket(issue);
      overdueByParent.set(parent, (overdueByParent.get(parent) ?? 0) + 1);
    }

    const heatCells = heatKeys.map((heatKey) => ({
      key: heatKey,
      label: formatDayLabel(heatKey),
      value: activityByDay.get(heatKey) ?? 0,
    }));
    const heatMax = Math.max(...heatCells.map((cell) => cell.value), 1);

    const heatByWeeks: Array<Array<{ key: string; label: string; value: number }>> = [];
    for (let i = 0; i < heatCells.length; i += 7) {
      heatByWeeks.push(heatCells.slice(i, i + 7));
    }

    const recentActivity = activityFeed
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 14);

    return {
      issueUpdateTrend,
      commentTrend,
      hourTrend,
      updatesTotal,
      commentsTotal,
      hoursTotal,
      avgHoursPerDay: Number((hoursTotal / Math.max(1, trendWindowDays)).toFixed(1)),
      peakUpdates,
      peakComments,
      peakHours,
      overdueParents: Array.from(overdueByParent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6),
      heatByWeeks,
      heatMax,
      recentActivity,
    };
  }, [issues, trendWindowDays]);

  const drilledIssues = useMemo(() => {
    if (!drilldown) {
      return [] as Issue[];
    }

    if (drilldown.type === "status") {
      return issues.filter((issue) => issue.statusName === drilldown.value);
    }
    if (drilldown.type === "parent") {
      return issues.filter((issue) => parentBucket(issue) === drilldown.value);
    }
    if (drilldown.type === "updated_day") {
      return issues.filter((issue) => dateKey(issue.updatedOnRemote) === drilldown.value);
    }
    if (drilldown.type === "comment_day") {
      return issues.filter((issue) => issue.journals.some((j) => dateKey(j.createdOnRemote) === drilldown.value));
    }
    if (drilldown.type === "timelog_day") {
      return issues.filter((issue) => issue.timeEntries.some((t) => dateKey(t.spentOn) === drilldown.value));
    }

    return issues.filter((issue) => activityCountForIssueOnDay(issue, drilldown.value) > 0);
  }, [drilldown, issues]);

  function drillTitle(): string {
    if (!drilldown) return "";
    if (drilldown.type === "status") return `Status: ${drilldown.value}`;
    if (drilldown.type === "parent") return `Parent Issue: ${drilldown.value}`;
    if (drilldown.type === "updated_day") return `Updated On: ${formatDayLabel(drilldown.value)}`;
    if (drilldown.type === "comment_day") return `Comments On: ${formatDayLabel(drilldown.value)}`;
    if (drilldown.type === "timelog_day") return `Time Logged On: ${formatDayLabel(drilldown.value)}`;
    return `Activity On: ${formatDayLabel(drilldown.value)}`;
  }

  function drillSignal(issue: Issue): string {
    if (!drilldown) return "";

    if (drilldown.type === "status") return issue.statusName;
    if (drilldown.type === "parent") return parentBucket(issue);
    if (drilldown.type === "updated_day") return new Date(issue.updatedOnRemote).toLocaleString();
    if (drilldown.type === "comment_day") {
      const count = issue.journals.filter((j) => dateKey(j.createdOnRemote) === drilldown.value).length;
      return `${count} comment(s)`;
    }
    if (drilldown.type === "timelog_day") {
      const hours = issue.timeEntries
        .filter((t) => dateKey(t.spentOn) === drilldown.value)
        .reduce((sum, t) => sum + t.hours, 0);
      return `${hours.toFixed(1)}h`;
    }

    return `${activityCountForIssueOnDay(issue, drilldown.value)} event(s)`;
  }

  function exportCsv(data: Issue[], fileBase: string) {
    const rows = [
      ["Issue ID", "Subject", "Status", "Priority", "Due Date", "Updated", "Parent", "Signal"],
      ...data.map((issue) => [
        `#${issue.redmineIssueId}`,
        issue.subject,
        issue.statusName,
        issue.priority ?? "",
        issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "",
        new Date(issue.updatedOnRemote).toLocaleString(),
        parentBucket(issue),
        drilldown ? drillSignal(issue) : "",
      ]),
    ];

    const csv = rows.map((line) => line.map((value) => csvEscape(value)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${fileBase}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  }

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">NRCC Analytics</p>
            <h1>NRCC Reports and Drilldowns</h1>
            <p className="muted">
              {user ? `Reporting view for ${user.displayName} (${user.username})` : "Loading report context..."}
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" onClick={() => void loadReportData()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh Reports"}
            </button>
            <Link href="/" className="primary-link nav-link">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      <section className="card reports-shell">
        <div className="reports-head">
          <div>
            <h2>Trend Lines</h2>
            <p className="muted">Click chart points or distribution rows to drill into matching issues.</p>
          </div>
          <div className="window-toggle">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                className={`window-btn ${trendWindowDays === days ? "active" : ""}`}
                onClick={() => {
                  setTrendWindowDays(days);
                  setDrilldown(null);
                }}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Issue Updates</p>
            <p className="report-value">{reports.updatesTotal}</p>
            <p className="report-foot">
              Peak {reports.peakUpdates.value} on {reports.peakUpdates.label}
            </p>
            <Sparkline
              points={reports.issueUpdateTrend}
              stroke="#1f7a87"
              fill="rgba(31, 122, 135, 0.17)"
              activeKey={drilldown?.type === "updated_day" ? drilldown.value : undefined}
              onPointClick={(key) => setDrilldown({ type: "updated_day", value: key })}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Comments Added</p>
            <p className="report-value">{reports.commentsTotal}</p>
            <p className="report-foot">
              Peak {reports.peakComments.value} on {reports.peakComments.label}
            </p>
            <Sparkline
              points={reports.commentTrend}
              stroke="#8a5b24"
              fill="rgba(180, 117, 52, 0.19)"
              activeKey={drilldown?.type === "comment_day" ? drilldown.value : undefined}
              onPointClick={(key) => setDrilldown({ type: "comment_day", value: key })}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Time Logged (h)</p>
            <p className="report-value">{reports.hoursTotal}</p>
            <p className="report-foot">
              Avg {reports.avgHoursPerDay}h/day • Peak {reports.peakHours.value}h on {reports.peakHours.label}
            </p>
            <Sparkline
              points={reports.hourTrend}
              stroke="#2e8558"
              fill="rgba(46, 133, 88, 0.17)"
              activeKey={drilldown?.type === "timelog_day" ? drilldown.value : undefined}
              onPointClick={(key) => setDrilldown({ type: "timelog_day", value: key })}
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Status Distribution</p>
            <div className="chip-row">
              {aggregates.byStatus.map(([status, count]) => (
                <button
                  key={status}
                  type="button"
                  className={`status-chip ${drilldown?.type === "status" && drilldown.value === status ? "active" : ""}`}
                  onClick={() => setDrilldown({ type: "status", value: status })}
                >
                  {status} <span>{count}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="report-card">
            <p className="report-label">Parent Issue Distribution</p>
            <div className="chip-row">
              {aggregates.byParent.map(([parent, count]) => (
                <button
                  key={parent}
                  type="button"
                  className={`status-chip ${drilldown?.type === "parent" && drilldown.value === parent ? "active" : ""}`}
                  onClick={() => setDrilldown({ type: "parent", value: parent })}
                >
                  {parent} <span>{count}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="report-card">
            <p className="report-label">Overdue by Parent Issue</p>
            {reports.overdueParents.length === 0 && <p className="muted">No overdue issues.</p>}
            {reports.overdueParents.map(([parent, count]) => (
              <button key={parent} type="button" className="report-list-row report-btn" onClick={() => setDrilldown({ type: "parent", value: parent })}>
                <span>{parent}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </article>
        </div>

        <article className="report-card heatmap-card">
          <div>
            <p className="report-label">Activity Heatmap (8 Weeks)</p>
            <p className="muted">Includes issue updates, comments, and timelog entries. Click a day to drill down.</p>
          </div>
          <div className="heatmap-grid">
            {reports.heatByWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="heatmap-column">
                {week.map((cell) => {
                  const ratio = cell.value / reports.heatMax;
                  const tone = ratio === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={`heatmap-cell tone-${tone} ${drilldown?.type === "activity_day" && drilldown.value === cell.key ? "active" : ""}`}
                      title={`${cell.label}: ${cell.value} events`}
                      onClick={() => setDrilldown({ type: "activity_day", value: cell.key })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </article>

        <article className="report-card">
          <p className="report-label">Recent Activity Trail</p>
          <div className="activity-feed">
            {reports.recentActivity.map((event, idx) => (
              <div key={`${event.issueId}-${event.timestamp}-${idx}`} className="activity-row static">
                <span>
                  #{event.issueId} {event.issueSubject}
                </span>
                <span>{event.detail}</span>
                <span>{new Date(event.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="card drilldown-card">
        <div className="drilldown-head">
          <div>
            <h2>Drilldown</h2>
            <p className="muted">
              {drilldown ? `${drillTitle()} • ${drilledIssues.length} issue(s)` : "Choose a trend point or distribution bucket above."}
            </p>
          </div>
          <div className="hero-actions">
            <button type="button" className="secondary-button" onClick={() => exportCsv(drilldown ? drilledIssues : issues, drilldown ? "nrcc-drilldown" : "nrcc-reports")}>Export CSV</button>
            {drilldown && (
              <button type="button" className="secondary-button" onClick={() => setDrilldown(null)}>
                Clear Drilldown
              </button>
            )}
          </div>
        </div>

        {drilldown && (
          <div className="drill-table-wrap">
            <table className="issues-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {drilledIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>#{issue.redmineIssueId}</td>
                    <td>{issue.subject}</td>
                    <td>{issue.statusName}</td>
                    <td>{issue.priority ?? "-"}</td>
                    <td>{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</td>
                    <td>{drillSignal(issue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
