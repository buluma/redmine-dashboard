"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TrendPoint = { key: string; value: number };

type Drilldown =
  | { type: "status"; value: string }
  | { type: "priority"; value: string }
  | { type: "tracker"; value: string }
  | { type: "project"; value: string }
  | { type: "assignee"; value: string }
  | { type: "day"; value: string; metric: "journals" | "time" }
  | null;

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function BarChart({
  items,
  color,
  onClick,
  active,
}: {
  items: { name: string; value: number }[];
  color: string;
  onClick?: (name: string) => void;
  active?: string;
}) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="bars-list">
      {items.map(item => (
        <button
          key={item.name}
          type="button"
          className={`bar-row ${active === item.name ? "active" : ""}`}
          onClick={() => onClick?.(item.name)}
        >
          <span className="bar-label">{item.name}</span>
          <span className="bar-value">{item.value}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
        </button>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const [data, setData] = useState<any>(null);

  async function loadReportData() {
    const res = await fetch(`/api/reports?days=${days}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Unable to load reports");
    setData(json);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await loadReportData();
        setDrilldown(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load reports");
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  if (loading && !data) {
    return <main className="dashboard"><p>Loading reports...</p></main>;
  }

  if (error && !data) {
    return <main className="dashboard"><p className="error-banner">{error}</p></main>;
  }

  if (!data) return null;

  const { aggregates, stats, trends, recent } = data;

  const journalTrend = trends.journalDaySeries.map((p: any) => ({ key: p.key, value: p.value }));
  const timeTrend = trends.timeDaySeries.map((p: any) => ({ key: p.key, value: p.value }));

  const journalTotal = journalTrend.reduce((s: number, p: TrendPoint) => s + p.value, 0);
  const timeTotal = trends.timeDaySeries.reduce((s: number, p: any) => s + p.value, 0);

  const peakJournals = journalTrend.reduce((acc: TrendPoint, p: TrendPoint) => p.value > acc.value ? p : acc, { key: "-", value: 0 });
  const peakTime = timeTrend.reduce((acc: any, p: any) => p.value > acc.value ? p : acc, { key: "-", value: 0 });

  const avgHoursPerDay = days > 0 ? Number((timeTotal / days).toFixed(1)) : 0;

  const drillTitle = () => {
    if (!drilldown) return "";
    const map: Record<string, string> = {
      status: `Status: ${drilldown.value}`,
      priority: `Priority: ${drilldown.value}`,
      tracker: `Tracker: ${drilldown.value}`,
      project: `Project: ${drilldown.value}`,
      assignee: `Assignee: ${drilldown.value}`,
    };
    if (drilldown.type === "day") {
      return `${drilldown.metric === "journals" ? "Comments" : "Time logged"} on ${formatDayLabel(drilldown.value)}`;
    }
    return map[drilldown.type] || "";
  };

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <h1>Reports</h1>
            <p className="muted">Insights across {stats.totalIssues.toLocaleString()} issues</p>
          </div>
          <div className="hero-actions">
            <label>
              Time Window
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      <section className="card reports-shell">
        <div className="reports-head">
          <div>
            <h2>Summary</h2>
            <p className="muted">Key metrics for the selected window</p>
          </div>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Total Issues</p>
            <p className="report-value">{stats.totalIssues.toLocaleString()}</p>
            <p className="report-foot">
              {stats.totalWithDueDate.toLocaleString()} with due dates
            </p>
          </article>

          <article className="report-card">
            <p className="report-label">Time Logged</p>
            <p className="report-value">{stats.totalTimeHours.toLocaleString()}h</p>
            <p className="report-foot">
              {stats.totalTimelogs.toLocaleString()} entries · {avgHoursPerDay}h/day avg
            </p>
          </article>

          <article className="report-card">
            <p className="report-label">Comments</p>
            <p className="report-value">{journalTotal.toLocaleString()}</p>
            <p className="report-foot">
              Peak {peakJournals.value} on {formatDayLabel(peakJournals.key)}
            </p>
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Comments Trend</p>
            <Sparkline
              points={journalTrend}
              stroke="#8a5b24"
              fill="rgba(180, 117, 52, 0.19)"
              activeKey={drilldown?.type === "day" && drilldown.metric === "journals" ? drilldown.value : undefined}
              onPointClick={(key) => setDrilldown({ type: "day", value: key, metric: "journals" })}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Time Logged Trend</p>
            <Sparkline
              points={timeTrend}
              stroke="#2e8558"
              fill="rgba(46, 133, 88, 0.17)"
              activeKey={drilldown?.type === "day" && drilldown.metric === "time" ? drilldown.value : undefined}
              onPointClick={(key) => setDrilldown({ type: "day", value: key, metric: "time" })}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Time by Activity</p>
            <BarChart
              items={trends.byActivity.map((a: any) => ({ name: a.name, value: a.hours }))}
              color="var(--signal)"
              active={drilldown?.type === "tracker" ? drilldown.value : undefined}
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Status Distribution</p>
            <BarChart
              items={aggregates.byStatus.map((s: any) => ({ name: s.name, value: s.count }))}
              color="var(--accent)"
              onClick={(name) => setDrilldown({ type: "status", value: name })}
              active={drilldown?.type === "status" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Priority Distribution</p>
            <BarChart
              items={aggregates.byPriority.map((p: any) => ({ name: p.name, value: p.count }))}
              color="var(--signal)"
              onClick={(name) => setDrilldown({ type: "priority", value: name })}
              active={drilldown?.type === "priority" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Top Projects</p>
            <BarChart
              items={aggregates.byProject.map((p: any) => ({ name: p.name, value: p.count }))}
              color="var(--accent-strong)"
              onClick={(name) => setDrilldown({ type: "project", value: name })}
              active={drilldown?.type === "project" ? drilldown.value : undefined}
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Top Assignees</p>
            <BarChart
              items={aggregates.byAssignee.map((a: any) => ({ name: a.name, value: a.count }))}
              color="var(--ok)"
              onClick={(name) => setDrilldown({ type: "assignee", value: name })}
              active={drilldown?.type === "assignee" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Overdue by Parent</p>
            {stats.overdueParents.length === 0 && <p className="muted">No overdue issues.</p>}
            {stats.overdueParents.map((op: any) => (
              <button key={op.label} type="button" className="report-list-row report-btn">
                <span>{op.label}</span>
                <strong>{op.count}</strong>
              </button>
            ))}
          </article>

          <article className="report-card">
            <p className="report-label">Time by User</p>
            <BarChart
              items={trends.byUser.map((u: any) => ({ name: u.name, value: u.hours }))}
              color="var(--accent-soft)"
            />
          </article>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="card">
        <h2>Recent Activity</h2>
        <div className="activity-feed">
          {[
            ...recent.journals.map((j: any) => ({
              timestamp: j.createdOnRemote,
              issueId: j.issueId,
              issueSubject: j.issueSubject,
              detail: `${j.author ?? "Unknown"} commented`,
            })),
            ...recent.timeEntries.map((t: any) => ({
              timestamp: t.spentOn,
              issueId: t.issueId,
              issueSubject: t.issueSubject,
              detail: `${t.hours.toFixed(1)}h logged${t.activityName ? ` (${t.activityName})` : ""}`,
            })),
          ]
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 20)
            .map((event: any, idx: number) => (
              <Link key={`${event.issueId}-${event.timestamp}-${idx}`} href={`/issues/${event.issueId}`} className="activity-row static">
                <span>
                  #{event.issueId} {event.issueSubject}
                </span>
                <span>{event.detail}</span>
                <span>{new Date(event.timestamp).toLocaleString()}</span>
              </Link>
            ))}
        </div>
      </section>

      {/* Drilldown */}
      <section className="card drilldown-card">
        <div className="drilldown-head">
          <div>
            <h2>Drilldown</h2>
            <p className="muted">
              {drilldown ? `${drillTitle()} — click a chart above to filter` : "Click any chart point or bar to drill down."}
            </p>
          </div>
          {drilldown && (
            <button type="button" className="secondary-button" onClick={() => setDrilldown(null)}>
              Clear Drilldown
            </button>
          )}
        </div>
        {drilldown && (
          <p className="muted" style={{ padding: "1rem 0" }}>
            Drilldown details require the issue detail page — click on a specific issue from the activity feed above.
          </p>
        )}
      </section>
    </main>
  );
}
