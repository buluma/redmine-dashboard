"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type TrendPoint = { key: string; value: number };
type NamedCount = { name: string; count: number };
type HoursMetric = { name: string; hours: number; count: number };
type OverdueParent = { label: string; count: number };
type RecentJournal = {
  id: string;
  issueId: number;
  issueSubject: string;
  author: string | null;
  notes: string | null;
  createdOnRemote: string;
};
type RecentTimeEntry = {
  id: string;
  issueId: number;
  issueSubject: string;
  hours: number;
  activityName: string | null;
  authorName: string | null;
  spentOn: string;
};
type ReportData = {
  aggregates: {
    byStatus: NamedCount[];
    byPriority: NamedCount[];
    byTracker: NamedCount[];
    byCategory: NamedCount[];
    byProject: NamedCount[];
    byAssignee: NamedCount[];
  };
  stats: {
    totalIssues: number;
    totalWithDueDate: number;
    overdueParents: OverdueParent[];
    totalTimeHours: number;
    totalTimelogs: number;
    openIssues: number;
    closedIssues: number;
    blockedOpenIssues: number;
    inProgressOpenIssues: number;
    overdueOpenIssues: number;
    unassignedOpenIssues: number;
    staleOpenIssues7d: number;
    staleOpenIssues30d: number;
    avgDoneRatioOpen: number;
    estimatedOpenIssues: number;
    spentOpenIssues: number;
    overspentOpenIssues: number;
  };
  trends: {
    journalDaySeries: TrendPoint[];
    timeDaySeries: TrendPoint[];
    byActivity: HoursMetric[];
    byUser: HoursMetric[];
    dueBuckets: NamedCount[];
    agingBuckets: NamedCount[];
    progressBuckets: NamedCount[];
  };
  recent: {
    journals: RecentJournal[];
    timeEntries: RecentTimeEntry[];
  };
};

type Drilldown =
  | { type: "status"; value: string }
  | { type: "priority"; value: string }
  | { type: "tracker"; value: string }
  | { type: "category"; value: string }
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

function ReportsLoadingShell() {
  return (
    <main className="dashboard reports-loading-page" aria-busy="true" aria-live="polite">
      <header className="card hero reports-loading-hero">
        <div className="hero-top">
          <div className="reports-loading-head">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-subtitle" />
          </div>
          <div className="reports-loading-actions">
            <span className="reports-refresh-pill">Loading metrics...</span>
            <div className="skeleton-line skeleton-button" />
          </div>
        </div>
      </header>

      <section className="card reports-shell reports-loading-shell">
        <div className="reports-head">
          <div className="reports-loading-head">
            <div className="skeleton-line skeleton-section-title" />
            <div className="skeleton-line skeleton-section-subtitle" />
          </div>
        </div>

        <div className="reports-grid reports-loading-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <article className="report-card report-skeleton-card" key={`summary-${idx}`}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-line skeleton-value" />
              <div className="skeleton-line skeleton-foot" />
            </article>
          ))}
        </div>

        <div className="reports-grid reports-loading-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <article className="report-card report-skeleton-card" key={`charts-${idx}`}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-chart" />
            </article>
          ))}
        </div>

        <div className="reports-grid reports-loading-grid">
          {Array.from({ length: 3 }).map((_, idx) => (
            <article className="report-card report-skeleton-card" key={`lists-${idx}`}>
              <div className="skeleton-line skeleton-label" />
              <div className="skeleton-list">
                {Array.from({ length: 6 }).map((__, row) => (
                  <div className="skeleton-line skeleton-list-row" key={`list-${idx}-${row}`} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card reports-loading-activity">
        <div className="skeleton-line skeleton-section-title" />
        <div className="skeleton-list">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div className="skeleton-line skeleton-list-row" key={`activity-${idx}`} />
          ))}
        </div>
      </section>
    </main>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const prefetchedIssueIdsRef = useRef<Set<number>>(new Set());

  const prefetchIssueDetail = useCallback((targetIssueId: number) => {
    if (!Number.isInteger(targetIssueId) || targetIssueId <= 0) {
      return;
    }
    if (prefetchedIssueIdsRef.current.has(targetIssueId)) {
      return;
    }
    prefetchedIssueIdsRef.current.add(targetIssueId);
    router.prefetch(`/issues/${targetIssueId}`);
    void fetch(`/api/issues/${targetIssueId}`, { cache: "no-store" }).catch(() => {
      prefetchedIssueIdsRef.current.delete(targetIssueId);
    });
  }, [router]);

  const loadReportData = useCallback(async () => {
    const res = await fetch(`/api/reports?days=${days}`, { cache: "no-store" });
    const json = (await res.json()) as ReportData & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Unable to load reports");
    setData(json);
  }, [days]);

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
  }, [loadReportData]);

  if (loading && !data) return <ReportsLoadingShell />;

  if (error && !data) {
    return <main className="dashboard"><p className="error-banner">{error}</p></main>;
  }

  if (!data) return null;

  const { aggregates, stats, trends, recent } = data;

  const journalTrend = trends.journalDaySeries.map((p) => ({ key: p.key, value: p.value }));
  const timeTrend = trends.timeDaySeries.map((p) => ({ key: p.key, value: p.value }));

  const journalTotal = journalTrend.reduce((s: number, p: TrendPoint) => s + p.value, 0);
  const timeTotal = timeTrend.reduce((s: number, p: TrendPoint) => s + p.value, 0);

  const peakJournals = journalTrend.reduce((acc: TrendPoint, p: TrendPoint) => p.value > acc.value ? p : acc, { key: "-", value: 0 });

  const avgHoursPerDay = days > 0 ? Number((timeTotal / days).toFixed(1)) : 0;
  const openRate = stats.totalIssues > 0 ? Math.round((stats.openIssues / stats.totalIssues) * 100) : 0;
  const overdueOpenRate = stats.openIssues > 0 ? Math.round((stats.overdueOpenIssues / stats.openIssues) * 100) : 0;
  const unassignedOpenRate = stats.openIssues > 0 ? Math.round((stats.unassignedOpenIssues / stats.openIssues) * 100) : 0;
  const staleOpenRate = stats.openIssues > 0 ? Math.round((stats.staleOpenIssues30d / stats.openIssues) * 100) : 0;
  const overspentRate = stats.estimatedOpenIssues > 0 ? Math.round((stats.overspentOpenIssues / stats.estimatedOpenIssues) * 100) : 0;
  const recentActivity = [
    ...recent.journals.map((j) => ({
      timestamp: j.createdOnRemote,
      issueId: j.issueId,
      issueSubject: j.issueSubject,
      detail: `${j.author ?? "Unknown"} commented`,
    })),
    ...recent.timeEntries.map((t) => ({
      timestamp: t.spentOn,
      issueId: t.issueId,
      issueSubject: t.issueSubject,
      detail: `${t.hours.toFixed(1)}h logged${t.activityName ? ` (${t.activityName})` : ""}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  const drillTitle = () => {
    if (!drilldown) return "";
    const map: Record<string, string> = {
      status: `Status: ${drilldown.value}`,
      priority: `Priority: ${drilldown.value}`,
      tracker: `Tracker: ${drilldown.value}`,
      category: `Category: ${drilldown.value}`,
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
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={loading}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            {loading && <span className="reports-refresh-pill" role="status">Refreshing...</span>}
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

        <div className="reports-grid reports-health-grid">
          <article className="report-card report-health-card">
            <p className="report-label">Open Queue</p>
            <p className="report-value">{stats.openIssues.toLocaleString()}</p>
            <p className="report-foot">
              {openRate}% of total · {stats.inProgressOpenIssues.toLocaleString()} in progress
            </p>
          </article>
          <article className="report-card report-health-card tone-danger">
            <p className="report-label">Overdue Open</p>
            <p className="report-value">{stats.overdueOpenIssues.toLocaleString()}</p>
            <p className="report-foot">
              {overdueOpenRate}% of open · {stats.blockedOpenIssues.toLocaleString()} blocked/hold
            </p>
          </article>
          <article className="report-card report-health-card tone-warning">
            <p className="report-label">Unassigned Open</p>
            <p className="report-value">{stats.unassignedOpenIssues.toLocaleString()}</p>
            <p className="report-foot">
              {unassignedOpenRate}% of open · avg done {stats.avgDoneRatioOpen}%
            </p>
          </article>
          <article className="report-card report-health-card tone-muted">
            <p className="report-label">Stale Open (&gt;30d)</p>
            <p className="report-value">{stats.staleOpenIssues30d.toLocaleString()}</p>
            <p className="report-foot">
              {staleOpenRate}% of open · {overspentRate}% over estimate
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
              items={trends.byActivity.map((a) => ({ name: a.name, value: a.hours }))}
              color="var(--signal)"
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Status Distribution</p>
            <BarChart
              items={aggregates.byStatus.map((s) => ({ name: s.name, value: s.count }))}
              color="var(--accent)"
              onClick={(name) => setDrilldown({ type: "status", value: name })}
              active={drilldown?.type === "status" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Priority Distribution</p>
            <BarChart
              items={aggregates.byPriority.map((p) => ({ name: p.name, value: p.count }))}
              color="var(--signal)"
              onClick={(name) => setDrilldown({ type: "priority", value: name })}
              active={drilldown?.type === "priority" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Tracker Distribution</p>
            <BarChart
              items={aggregates.byTracker.map((t) => ({ name: t.name, value: t.count }))}
              color="var(--accent-strong)"
              onClick={(name) => setDrilldown({ type: "tracker", value: name })}
              active={drilldown?.type === "tracker" ? drilldown.value : undefined}
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Top Assignees</p>
            <BarChart
              items={aggregates.byAssignee.map((a) => ({ name: a.name, value: a.count }))}
              color="var(--ok)"
              onClick={(name) => setDrilldown({ type: "assignee", value: name })}
              active={drilldown?.type === "assignee" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Overdue by Parent</p>
            {stats.overdueParents.length === 0 && <p className="muted">No overdue issues.</p>}
            {stats.overdueParents.map((op) => (
              <button key={op.label} type="button" className="report-list-row report-btn">
                <span>{op.label}</span>
                <strong>{op.count}</strong>
              </button>
            ))}
          </article>

          <article className="report-card">
            <p className="report-label">Time by User</p>
            <BarChart
              items={trends.byUser.map((u) => ({ name: u.name, value: u.hours }))}
              color="var(--accent-soft)"
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Due Risk Buckets</p>
            <BarChart
              items={trends.dueBuckets.map((bucket) => ({ name: bucket.name, value: bucket.count }))}
              color="var(--signal)"
            />
          </article>

          <article className="report-card">
            <p className="report-label">Staleness Buckets</p>
            <BarChart
              items={trends.agingBuckets.map((bucket) => ({ name: bucket.name, value: bucket.count }))}
              color="var(--accent)"
            />
          </article>

          <article className="report-card">
            <p className="report-label">Progress Buckets</p>
            <BarChart
              items={trends.progressBuckets.map((bucket) => ({ name: bucket.name, value: bucket.count }))}
              color="var(--ok)"
            />
          </article>
        </div>

        <div className="reports-grid">
          <article className="report-card">
            <p className="report-label">Category Distribution</p>
            <BarChart
              items={aggregates.byCategory.map((c) => ({ name: c.name, value: c.count }))}
              color="var(--accent-strong)"
              onClick={(name) => setDrilldown({ type: "category", value: name })}
              active={drilldown?.type === "category" ? drilldown.value : undefined}
            />
          </article>

          <article className="report-card">
            <p className="report-label">Closed Issues</p>
            <p className="report-value">{stats.closedIssues.toLocaleString()}</p>
            <p className="report-foot">
              Estimated open: {stats.estimatedOpenIssues.toLocaleString()} · spent logged on {stats.spentOpenIssues.toLocaleString()}
            </p>
          </article>

          <article className="report-card">
            <p className="report-label">Estimate Overrun (Open)</p>
            <p className="report-value">{stats.overspentOpenIssues.toLocaleString()}</p>
            <p className="report-foot">
              {overspentRate}% of open issues with estimates
            </p>
          </article>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="card">
        <h2>Recent Activity</h2>
        <div className="activity-feed">
          {recentActivity.map((event, idx: number) => (
              <Link
                key={`${event.issueId}-${event.timestamp}-${idx}`}
                href={`/issues/${event.issueId}`}
                className="activity-row static"
                onMouseEnter={() => prefetchIssueDetail(event.issueId)}
                onFocus={() => prefetchIssueDetail(event.issueId)}
              >
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
