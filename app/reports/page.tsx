"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, DonutChart, BarChartEnhanced, StatCard, ProgressRing } from "@/src/components/reports/charts";

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

type ReportsFilters = {
  days: number;
  issueId: string;
  from: string;
  to: string;
  assignees: string;
};

const DEFAULT_FILTERS: ReportsFilters = {
  days: 30,
  issueId: "",
  from: "",
  to: "",
  assignees: "",
};

const DONUT_COLORS = ["#6366f1", "#8b5cf6", "#34d399", "#fbbf24", "#f87171", "#38bdf8", "#fb923c", "#a3e635", "#e879f9", "#2dd4bf"];

function formatDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function ReportsLoadingShell() {
  return (
    <main className="dashboard reports-v2-loading" aria-busy="true" aria-live="polite">
      <header className="reports-hero-loading">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-subtitle" />
      </header>
      <div className="reports-stats-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card stat-skeleton">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
          </div>
        ))}
      </div>
      <div className="reports-charts-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="report-panel report-panel-skeleton">
            <div className="skeleton-line skeleton-chart" />
          </div>
        ))}
      </div>
    </main>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportsFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportsFilters>(DEFAULT_FILTERS);
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const prefetchedIssueIdsRef = useRef<Set<number>>(new Set());

  const prefetchIssueDetail = useCallback((targetIssueId: number) => {
    if (!Number.isInteger(targetIssueId) || targetIssueId <= 0) return;
    if (prefetchedIssueIdsRef.current.has(targetIssueId)) return;
    prefetchedIssueIdsRef.current.add(targetIssueId);
    router.prefetch(`/issues/${targetIssueId}`);
    void fetch(`/api/issues/${targetIssueId}`, { cache: "no-store" }).catch(() => {
      prefetchedIssueIdsRef.current.delete(targetIssueId);
    });
  }, [router]);

  const loadReportData = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("days", String(appliedFilters.days));
    if (appliedFilters.issueId.trim()) params.set("issueId", appliedFilters.issueId.trim());
    if (appliedFilters.from.trim()) params.set("from", appliedFilters.from.trim());
    if (appliedFilters.to.trim()) params.set("to", appliedFilters.to.trim());
    if (appliedFilters.assignees.trim()) params.set("assignees", appliedFilters.assignees.trim());

    const res = await fetch(`/api/reports?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as ReportData & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Unable to load reports");
    setData(json);
  }, [appliedFilters]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
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
  if (error && !data) return <main className="dashboard"><p className="error-banner">{error}</p></main>;
  if (!data) return null;

  const { aggregates, stats, trends, recent } = data;

  const journalTotal = trends.journalDaySeries.reduce((s: number, p) => s + p.value, 0);
  const timeTotal = trends.timeDaySeries.reduce((s: number, p) => s + p.value, 0);
  const peakJournals = trends.journalDaySeries.reduce((a: TrendPoint, p) => p.value > a.value ? p : a, { key: "-", value: 0 });
  const avgHoursPerDay = trends.timeDaySeries.length > 0 ? Number((timeTotal / trends.timeDaySeries.length).toFixed(1)) : 0;

  const openRate = stats.totalIssues > 0 ? Math.round((stats.openIssues / stats.totalIssues) * 100) : 0;
  const overdueOpenRate = stats.openIssues > 0 ? Math.round((stats.overdueOpenIssues / stats.openIssues) * 100) : 0;
  const unassignedOpenRate = stats.openIssues > 0 ? Math.round((stats.unassignedOpenIssues / stats.openIssues) * 100) : 0;
  const staleOpenRate = stats.openIssues > 0 ? Math.round((stats.staleOpenIssues30d / stats.openIssues) * 100) : 0;
  const overspentRate = stats.estimatedOpenIssues > 0 ? Math.round((stats.overspentOpenIssues / stats.estimatedOpenIssues) * 100) : 0;

  const knownAssignees = aggregates.byAssignee.map((i) => i.name).filter((n) => n && n !== "Unassigned");

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = filters.issueId.trim();
    if (trimmed && (!/^\d+$/.test(trimmed) || Number.parseInt(trimmed, 10) <= 0)) {
      setError("Issue ID must be a positive number.");
      return;
    }
    if (filters.from && filters.to && new Date(filters.from).getTime() > new Date(filters.to).getTime()) {
      setError("Date range is invalid.");
      return;
    }
    setError(null);
    setAppliedFilters(filters);
  }

  function resetFilters() {
    setError(null);
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setDrilldown(null);
  }

  const recentActivity = [
    ...recent.journals.map((j) => ({
      type: "comment" as const,
      timestamp: j.createdOnRemote,
      issueId: j.issueId,
      issueSubject: j.issueSubject,
      author: j.author ?? "Unknown",
      detail: j.notes?.slice(0, 80) ?? "",
    })),
    ...recent.timeEntries.map((t) => ({
      type: "time" as const,
      timestamp: t.spentOn,
      issueId: t.issueId,
      issueSubject: t.issueSubject,
      author: t.authorName ?? "Unknown",
      detail: `${t.hours.toFixed(1)}h${t.activityName ? ` · ${t.activityName}` : ""}`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);

  const statusSegments = aggregates.byStatus.slice(0, 6).map((s, i) => ({
    name: s.name,
    value: s.count,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const prioritySegments = aggregates.byPriority.slice(0, 5).map((p, i) => ({
    name: p.name,
    value: p.count,
    color: DONUT_COLORS[(i + 3) % DONUT_COLORS.length],
  }));

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
    <main className="dashboard reports-v2">
      {/* Hero */}
      <header className="reports-hero">
        <div className="reports-hero-content">
          <div>
            <h1>Reports</h1>
            <p className="reports-hero-sub">
              Insights across <strong>{stats.totalIssues.toLocaleString()}</strong> issues
              {appliedFilters.days !== 30 && <span> · Last {appliedFilters.days} days</span>}
            </p>
          </div>
          <div className="reports-hero-actions">
            {loading && <span className="loading-pill" role="status">Refreshing...</span>}
            <Link href="/" className="btn-ghost">← Dashboard</Link>
          </div>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}

      {/* Filters */}
      <section className="report-panel filters-panel">
        <div className="report-panel-head">
          <div>
            <h2>Filters</h2>
            <p className="muted">Adjust reporting scope</p>
          </div>
        </div>
        <form className="filters-form" onSubmit={applyFilters}>
          <div className="filters-grid">
            <label className="filter-field">
              <span className="filter-label">Time Window</span>
              <select value={filters.days} onChange={(e) => setFilters((p) => ({ ...p, days: Number(e.target.value) }))} disabled={loading}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <label className="filter-field">
              <span className="filter-label">Issue ID</span>
              <input type="number" min={1} placeholder="e.g. 113112" value={filters.issueId} onChange={(e) => setFilters((p) => ({ ...p, issueId: e.target.value }))} disabled={loading} />
            </label>
            <label className="filter-field">
              <span className="filter-label">From</span>
              <input type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} disabled={loading} />
            </label>
            <label className="filter-field">
              <span className="filter-label">To</span>
              <input type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} disabled={loading} />
            </label>
            <label className="filter-field filter-field-wide">
              <span className="filter-label">Assignees</span>
              <input type="text" placeholder="Comma-separated names" value={filters.assignees} onChange={(e) => setFilters((p) => ({ ...p, assignees: e.target.value }))} list="reports-assignees-list" disabled={loading} />
              <datalist id="reports-assignees-list">
                {knownAssignees.map((n) => <option key={n} value={n} />)}
                <option value="Unassigned" />
              </datalist>
            </label>
          </div>
          <div className="filters-actions">
            <button type="submit" className="btn-primary" disabled={loading}>Apply</button>
            <button type="button" className="btn-ghost" onClick={resetFilters} disabled={loading}>Reset</button>
          </div>
        </form>
      </section>

      {/* Stats Grid */}
      <div className="reports-stats-grid">
        <StatCard
          label="Total Issues"
          value={stats.totalIssues.toLocaleString()}
          foot={`${stats.totalWithDueDate.toLocaleString()} with due dates`}
          icon="📋"
          tone="info"
        />
        <StatCard
          label="Time Logged"
          value={`${stats.totalTimeHours.toLocaleString()}h`}
          foot={`${stats.totalTimelogs} entries · ${avgHoursPerDay}h/day`}
          icon="⏱"
          tone="success"
        />
        <StatCard
          label="Comments"
          value={journalTotal.toLocaleString()}
          foot={`Peak ${peakJournals.value} on ${formatDayLabel(peakJournals.key)}`}
          icon="💬"
          tone="default"
        />
        <StatCard
          label="Open Rate"
          value={`${openRate}%`}
          foot={`${stats.openIssues} open · ${stats.closedIssues} closed`}
          icon="📊"
          tone={openRate > 70 ? "warning" : "success"}
        />
      </div>

      {/* Health Cards */}
      <div className="reports-health-grid">
        <div className="health-card health-open">
          <div className="health-head">
            <span className="health-icon">🟢</span>
            <span className="health-label">Open Queue</span>
          </div>
          <div className="health-value">{stats.openIssues.toLocaleString()}</div>
          <div className="health-foot">{stats.inProgressOpenIssues} in progress</div>
          <ProgressRing value={Math.min(100, openRate)} color="#34d399" size={40} strokeWidth={4} />
        </div>
        <div className="health-card health-danger">
          <div className="health-head">
            <span className="health-icon">🔴</span>
            <span className="health-label">Overdue</span>
          </div>
          <div className="health-value">{stats.overdueOpenIssues.toLocaleString()}</div>
          <div className="health-foot">{stats.blockedOpenIssues} blocked · {overdueOpenRate}% of open</div>
        </div>
        <div className="health-card health-warning">
          <div className="health-head">
            <span className="health-icon">🟡</span>
            <span className="health-label">Unassigned</span>
          </div>
          <div className="health-value">{stats.unassignedOpenIssues.toLocaleString()}</div>
          <div className="health-foot">{unassignedOpenRate}% of open · avg {stats.avgDoneRatioOpen}% done</div>
        </div>
        <div className="health-card health-muted">
          <div className="health-head">
            <span className="health-icon">⚪</span>
            <span className="health-label">Stale 30d+</span>
          </div>
          <div className="health-value">{stats.staleOpenIssues30d.toLocaleString()}</div>
          <div className="health-foot">{staleOpenRate}% of open · {overspentRate}% over estimate</div>
        </div>
      </div>

      {/* Drilldown banner */}
      {drilldown && (
        <div className="drilldown-banner">
          <span className="drilldown-text">{drillTitle()}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDrilldown(null)}>Clear</button>
        </div>
      )}

      {/* Charts - Row 1: Trends (2 columns) */}
      <div className="reports-charts-grid reports-charts-row-2">
        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Comments Trend</h3>
            <span className="report-panel-badge">{journalTotal} total</span>
          </div>
          <AreaChart
            points={trends.journalDaySeries}
            stroke="#f59e0b"
            fill="#fbbf24"
            tooltipLabel={(k, v) => `${formatDayLabel(k)}: ${v} comments`}
            onClick={(key) => setDrilldown({ type: "day", value: key, metric: "journals" })}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Time Logged</h3>
            <span className="report-panel-badge">{timeTotal.toFixed(1)}h total</span>
          </div>
          <AreaChart
            points={trends.timeDaySeries}
            stroke="#10b981"
            fill="#34d399"
            tooltipLabel={(k, v) => `${formatDayLabel(k)}: ${v}h`}
            onClick={(key) => setDrilldown({ type: "day", value: key, metric: "time" })}
          />
        </div>
      </div>

      {/* Row 2: Status, Priority, Activity (3 columns) */}
      <div className="reports-charts-grid reports-charts-row-3">
        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Status Distribution</h3>
          </div>
          <DonutChart
            segments={statusSegments}
            centerLabel="Total"
            centerValue={stats.totalIssues}
            onClick={(name) => setDrilldown({ type: "status", value: name })}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Priority Mix</h3>
          </div>
          <DonutChart
            segments={prioritySegments}
            centerLabel="Priority"
            centerValue={aggregates.byPriority.reduce((s, p) => s + p.count, 0)}
            onClick={(name) => setDrilldown({ type: "priority", value: name })}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Time by Activity</h3>
          </div>
          <BarChartEnhanced
            items={trends.byActivity.map((a) => ({ name: a.name, value: a.hours }))}
          />
        </div>
      </div>

      {/* Row 3: Time by User, Top Assignees, Due Risk (3 columns) */}
      <div className="reports-charts-grid reports-charts-row-3">
        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Time by User</h3>
          </div>
          <BarChartEnhanced
            items={trends.byUser.map((u) => ({ name: u.name, value: u.hours }))}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Top Assignees</h3>
          </div>
          <BarChartEnhanced
            items={aggregates.byAssignee.slice(0, 8).map((a) => ({ name: a.name, value: a.count }))}
            onClick={(name) => setDrilldown({ type: "assignee", value: name })}
            active={drilldown?.type === "assignee" ? drilldown.value : undefined}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Due Risk</h3>
          </div>
          <BarChartEnhanced
            items={trends.dueBuckets.map((b) => ({ name: b.name, value: b.count }))}
            colors={["#f87171", "#fb923c", "#fbbf24", "#34d399", "#94a3b8"]}
          />
        </div>
      </div>

      {/* Row 4: Staleness, Progress, Overdue by Parent (3 columns or 2) */}
      <div className="reports-charts-grid reports-charts-row-3">
        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Staleness</h3>
          </div>
          <BarChartEnhanced
            items={trends.agingBuckets.map((b) => ({ name: b.name, value: b.count }))}
            colors={["#34d399", "#fbbf24", "#fb923c", "#f87171"]}
          />
        </div>

        <div className="report-panel">
          <div className="report-panel-head">
            <h3>Progress</h3>
          </div>
          <BarChartEnhanced
            items={trends.progressBuckets.map((b) => ({ name: b.name, value: b.count }))}
            colors={["#f87171", "#fb923c", "#fbbf24", "#38bdf8", "#34d399"]}
          />
        </div>

        {stats.overdueParents.length > 0 && (
          <div className="report-panel">
            <div className="report-panel-head">
              <h3>Overdue by Parent</h3>
            </div>
            <BarChartEnhanced
              items={stats.overdueParents.map((p) => ({ name: p.label, value: p.count }))}
              colors={["#f87171", "#fb923c", "#fbbf24"]}
            />
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <section className="report-panel activity-panel">
        <div className="report-panel-head">
          <div>
            <h3>Recent Activity</h3>
            <p className="muted">Latest comments and time entries</p>
          </div>
        </div>
        <div className="activity-timeline">
          {recentActivity.map((event, idx) => (
            <Link
              key={`${event.issueId}-${event.timestamp}-${idx}`}
              href={`/issues/${event.issueId}`}
              className="activity-item"
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={() => prefetchIssueDetail(event.issueId)}
              onFocus={() => prefetchIssueDetail(event.issueId)}
            >
              <div className={`activity-dot ${event.type === "comment" ? "dot-comment" : "dot-time"}`} />
              <div className="activity-body">
                <div className="activity-head">
                  <span className="activity-issue">#{event.issueId} {event.issueSubject}</span>
                  <span className="activity-time">{formatTimeAgo(event.timestamp)}</span>
                </div>
                <div className="activity-detail">
                  <span className={`activity-type type-${event.type}`}>
                    {event.type === "comment" ? "💬" : "⏱"} {event.author}
                  </span>
                  {event.detail && <span className="activity-note">{event.detail}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
