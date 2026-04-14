"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  DonutChart,
  BarChartEnhanced,
  StatCard,
} from "@/src/components/reports/charts";
import type {
  WakaTimeStatsResponse,
  WakaTimeSummariesResponse,
  WakaTimeAllTimeResponse,
  WakaTimeTodayResponse,
  WakaTimeGoalsResponse,
  WakaTimeInsightsResponse,
} from "@/src/lib/wakatime";
import {
  CHART_COLORS,
  WAKATIME_RANGE_OPTIONS,
  type WakaTimeRange,
  type WakaTimeReportPayload,
} from "@/src/lib/wakatime";

type Props = {
  stats: WakaTimeStatsResponse;
  summaries: WakaTimeSummariesResponse | null;
  allTime: WakaTimeAllTimeResponse | null;
  today: WakaTimeTodayResponse | null;
  weekdayInsight: WakaTimeInsightsResponse | null;
  goals: WakaTimeGoalsResponse | null;
  heartbeatDays: Array<{
    date: string;
    data: {
      data: Array<{
        time: number;
        category?: string;
      }>;
    } | null;
  }>;
  initialRange: WakaTimeRange;
};

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_NAMES: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

const HEARTBEAT_ACTIVITY_COLORS = ["#0f6f87", "#34d399", "#5b5bf0", "#f59e0b", "#f87171"];

function roundHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 10) / 10;
}

function hoursLabel(totalSeconds: number): string {
  return `${roundHours(totalSeconds)}h`;
}

function formatDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, monthRaw, dayRaw] = value.split("-");
    const monthIdx = Number(monthRaw) - 1;
    const day = Number(dayRaw);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (monthIdx >= 0 && monthIdx < months.length) {
      return `${months[monthIdx]} ${day}`;
    }
  }
  return value;
}

function formatTime(value: string): string {
  const m = value.match(/T(\d{2}):(\d{2})/);
  if (m) {
    return `${m[1]}:${m[2]}`;
  }
  return value;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatMixValue(value: number, mode: "heartbeats" | "summaries"): string {
  if (mode === "heartbeats") {
    const rounded = Math.round(value);
    return `${rounded} event${rounded === 1 ? "" : "s"}`;
  }
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function WakatimeChartsClient({
  stats,
  summaries,
  allTime,
  today,
  weekdayInsight,
  goals,
  heartbeatDays,
  initialRange,
}: Props) {
  const [selectedRange, setSelectedRange] = useState<WakaTimeRange>(initialRange);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredWeekday, setHoveredWeekday] = useState<string | null>(null);
  const [report, setReport] = useState<WakaTimeReportPayload>({
    range: initialRange,
    generatedAt: new Date().toISOString(),
    stats,
    summaries,
    allTime,
    today,
    insights: {
      weekday: weekdayInsight,
    },
    goals,
    heartbeats: {
      start: heartbeatDays[0]?.date ?? "",
      end: heartbeatDays[heartbeatDays.length - 1]?.date ?? "",
      days: heartbeatDays,
    },
  });

  const d = report.stats.data;

  const summaryDays = useMemo(
    () =>
      [...(report.summaries?.data?.summaries ?? [])].sort((a, b) =>
        a.range.start.localeCompare(b.range.start),
      ),
    [report.summaries],
  );

  const activeDays = useMemo(
    () => summaryDays.filter((s) => s.grand_total.total_seconds > 0).length,
    [summaryDays],
  );

  const currentStreak = useMemo(() => {
    let streak = 0;
    for (let i = summaryDays.length - 1; i >= 0; i -= 1) {
      if (summaryDays[i].grand_total.total_seconds <= 0) break;
      streak += 1;
    }
    return streak;
  }, [summaryDays]);

  const dailyTrend = useMemo(
    () =>
      summaryDays.map((s) => ({
        key: s.range.start,
        value: roundHours(s.grand_total.total_seconds),
      })),
    [summaryDays],
  );

  const rangeTrend = useMemo(() => {
    const n = summaryDays.length;
    if (n < 8) return null;

    const firstWindow = summaryDays.slice(0, Math.floor(n / 2));
    const secondWindow = summaryDays.slice(Math.floor(n / 2));

    const firstTotal = firstWindow.reduce((sum, day) => sum + day.grand_total.total_seconds, 0);
    const secondTotal = secondWindow.reduce((sum, day) => sum + day.grand_total.total_seconds, 0);
    if (firstTotal <= 0) return null;

    const delta = ((secondTotal - firstTotal) / firstTotal) * 100;
    return {
      value: Number(delta.toFixed(1)),
      label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs earlier period`,
    };
  }, [summaryDays]);

  const topDays = useMemo(
    () =>
      [...summaryDays]
        .filter((s) => s.grand_total.total_seconds > 0)
        .sort((a, b) => b.grand_total.total_seconds - a.grand_total.total_seconds)
        .slice(0, 6),
    [summaryDays],
  );

  const toSegments = (items: { name: string; total_seconds: number }[] | undefined) =>
    (items ?? [])
      .filter((x) => x.total_seconds > 0)
      .slice(0, 8)
      .map((x, i) => ({
        name: x.name || "Unknown",
        value: roundHours(x.total_seconds),
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

  const toBarItems = (items: { name: string; total_seconds: number }[] | undefined) =>
    (items ?? [])
      .filter((x) => x.total_seconds > 0)
      .slice(0, 8)
      .map((x) => ({
        name: x.name || "Unknown",
        value: roundHours(x.total_seconds),
      }));

  const goalRows = useMemo(() => {
    const source = report.goals?.data ?? [];

    return source
      .filter((goal) => goal.is_enabled !== false)
      .map((goal) => {
        const points = Array.isArray(goal.chart_data) ? goal.chart_data : [];
        const latest = points.length > 0 ? points[points.length - 1] : null;
        const actualSeconds = toFiniteNumber(latest?.actual_seconds) ?? 0;
        const goalSeconds = toFiniteNumber(latest?.goal_seconds) ?? 0;
        const progress = goalSeconds > 0
          ? Math.max(0, Math.min(100, Math.round((actualSeconds / goalSeconds) * 100)))
          : null;
        const status = String(
          goal.status ?? latest?.range_status ?? goal.cumulative_status ?? goal.average_status ?? "pending",
        );

        return {
          id: goal.id,
          title: goal.custom_title?.trim() || goal.title?.trim() || "Untitled goal",
          cadence: goal.delta === "week" ? "weekly" : "daily",
          status,
          progress,
          actualText: latest?.actual_seconds_text || hoursLabel(actualSeconds),
          targetText: latest?.goal_seconds_text || (goalSeconds > 0 ? hoursLabel(goalSeconds) : "No target"),
          reason: latest?.range_status_reason || "",
        };
      })
      .slice(0, 6);
  }, [report.goals]);

  const onTrackGoals = useMemo(
    () => goalRows.filter((goal) => goal.status.toLowerCase().includes("success")).length,
    [goalRows],
  );

  const selectedRangeLabel =
    WAKATIME_RANGE_OPTIONS.find((r) => r.value === selectedRange)?.label ?? selectedRange;

  const weekdayActivityMix = useMemo(() => {
    const normalizeCategory = (value: string | undefined) => {
      const c = (value || "coding").toLowerCase();
      if (c.includes("coding")) return "Coding";
      if (c.includes("debug")) return "Debugging";
      if (c.includes("test")) return "Testing";
      if (c.includes("review")) return "Review";
      if (c.includes("doc")) return "Docs";
      if (c.includes("research")) return "Research";
      return "Other";
    };

    const heartbeatDays = report.heartbeats.days ?? [];
    const heartbeatWeekdayCategory = new Map<number, Map<string, number>>();
    let missingHeartbeatsScope = false;
    let heartbeatSamples = 0;

    for (const day of heartbeatDays) {
      if (!day.data) {
        missingHeartbeatsScope = true;
        continue;
      }
      const parsed = new Date(`${day.date}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) continue;
      const weekday = parsed.getDay();
      if (!heartbeatWeekdayCategory.has(weekday)) {
        heartbeatWeekdayCategory.set(weekday, new Map<string, number>());
      }
      const categoryMap = heartbeatWeekdayCategory.get(weekday)!;
      for (const hb of day.data.data ?? []) {
        const category = normalizeCategory(hb.category);
        categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1);
        heartbeatSamples += 1;
      }
    }

    if (heartbeatSamples > 0) {
      const totals = new Map<string, number>();
      for (const [, categoryMap] of heartbeatWeekdayCategory) {
        for (const [cat, count] of categoryMap) {
          totals.set(cat, (totals.get(cat) ?? 0) + count);
        }
      }
      const topCategories = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([cat]) => cat);

      const series = topCategories.map((cat) => ({
        name: cat,
        data: WEEKDAY_ORDER.map((weekday) => ({
          label: WEEKDAY_NAMES[weekday],
          value: heartbeatWeekdayCategory.get(weekday)?.get(cat) ?? 0,
        })),
      }));

      return {
        series,
        mode: "heartbeats" as const,
        missingHeartbeatsScope,
      };
    }

    const fallbackWeekdayCategory = new Map<number, Map<string, number>>();
    for (const day of summaryDays) {
      const parsed = new Date(`${day.range.start}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) continue;
      const weekday = parsed.getDay();
      if (!fallbackWeekdayCategory.has(weekday)) {
        fallbackWeekdayCategory.set(weekday, new Map<string, number>());
      }
      const map = fallbackWeekdayCategory.get(weekday)!;
      for (const category of day.categories ?? []) {
        const key = normalizeCategory(category.name);
        map.set(key, (map.get(key) ?? 0) + roundHours(category.total_seconds));
      }
    }

    const totals = new Map<string, number>();
    for (const [, categoryMap] of fallbackWeekdayCategory) {
      for (const [cat, count] of categoryMap) {
        totals.set(cat, (totals.get(cat) ?? 0) + count);
      }
    }
    const topCategories = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat]) => cat);

    return {
      series: topCategories.map((cat) => ({
        name: cat,
        data: WEEKDAY_ORDER.map((weekday) => ({
          label: WEEKDAY_NAMES[weekday],
          value: Math.round((fallbackWeekdayCategory.get(weekday)?.get(cat) ?? 0) * 10) / 10,
        })),
      })),
      mode: "summaries" as const,
      missingHeartbeatsScope,
    };
  }, [report.heartbeats.days, summaryDays]);

  const weekdayMixRows = useMemo(() => {
    return WEEKDAY_ORDER.map((weekday) => {
      const label = WEEKDAY_NAMES[weekday];
      const items = weekdayActivityMix.series
        .map((series, index) => {
          const point = series.data.find((p) => p.label === label);
          const value = point?.value ?? 0;
          return {
            name: series.name,
            value,
            color: HEARTBEAT_ACTIVITY_COLORS[index % HEARTBEAT_ACTIVITY_COLORS.length],
          };
        })
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value);

      const total = items.reduce((sum, item) => sum + item.value, 0);
      return { label, items, total };
    });
  }, [weekdayActivityMix.series]);

  const defaultWeekdayTooltip = useMemo(() => {
    const withActivity = weekdayMixRows.filter((row) => row.total > 0);
    if (withActivity.length === 0) return null;
    return [...withActivity].sort((a, b) => b.total - a.total)[0].label;
  }, [weekdayMixRows]);

  const activeWeekdayRow = useMemo(() => {
    if (weekdayMixRows.length === 0) return null;
    if (!hoveredWeekday && defaultWeekdayTooltip) {
      return weekdayMixRows.find((row) => row.label === defaultWeekdayTooltip) ?? weekdayMixRows[0];
    }
    return weekdayMixRows.find((row) => row.label === hoveredWeekday) ?? weekdayMixRows[0];
  }, [hoveredWeekday, weekdayMixRows, defaultWeekdayTooltip]);

  const todaySeconds = report.today?.data.total_seconds ?? 0;
  const dailyAverageSeconds = d.daily_average ?? 0;
  const gaugePercent = dailyAverageSeconds > 0
    ? Math.max(0, Math.min(100, Math.round((todaySeconds / dailyAverageSeconds) * 100)))
    : 0;
  const deltaPercent = dailyAverageSeconds > 0
    ? Math.round(((todaySeconds - dailyAverageSeconds) / dailyAverageSeconds) * 100)
    : 0;

  const handleRangeChange = async (newRange: WakaTimeRange) => {
    if (newRange === selectedRange || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/wakatime/stats?range=${encodeURIComponent(newRange)}`);
      const payload = (await res.json()) as Partial<WakaTimeReportPayload> & { error?: string };

      if (!res.ok) {
        throw new Error(payload.error ?? `Request failed with ${res.status}`);
      }

      if (!payload.stats) {
        throw new Error("Invalid WakaTime payload from server");
      }

      setReport({
        range: (payload.range as WakaTimeRange) ?? newRange,
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        stats: payload.stats,
        summaries: payload.summaries ?? null,
        allTime: payload.allTime ?? null,
        today: payload.today ?? null,
        insights: payload.insights ?? { weekday: null },
        goals: payload.goals ?? null,
        heartbeats: payload.heartbeats ?? {
          start: "",
          end: "",
          days: [],
        },
      });
      setSelectedRange((payload.range as WakaTimeRange) ?? newRange);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to refresh WakaTime report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card reports-filters-panel">
        <div className="reports-head">
          <div>
            <h2>Report Window</h2>
            <p className="muted">{selectedRangeLabel} view</p>
          </div>
          <div className="window-toggle" role="tablist" aria-label="WakaTime report range">
            {WAKATIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selectedRange === option.value}
                className={`window-btn ${selectedRange === option.value ? "active" : ""}`}
                onClick={() => handleRangeChange(option.value)}
                disabled={busy}
              >
                {busy && selectedRange === option.value ? "Loading..." : option.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="error-banner" style={{ marginTop: "0.65rem" }}>{error}</p>}
      </section>

      <div className="reports-stats-grid">
        <StatCard
          label="Range Total"
          value={hoursLabel(d.total_seconds)}
          foot={`${selectedRangeLabel} coding time · ${currentStreak}d streak`}
          tone="info"
          trend={rangeTrend ?? undefined}
        />
        <StatCard
          label="Daily Average"
          value={hoursLabel(d.daily_average)}
          foot={`${summaryDays.length || d.days_including_holidays} days in report`}
          tone="success"
        />
        <StatCard
          label="Active Days"
          value={`${activeDays}/${summaryDays.length}`}
          foot={`${summaryDays.length > 0 ? Math.round((activeDays / summaryDays.length) * 100) : 0}% with coding activity`}
          tone="success"
        />
        <StatCard
          label="Goals"
          value={goalRows.length > 0 ? `${onTrackGoals}/${goalRows.length}` : "-"}
          foot={goalRows.length > 0 ? "goals currently successful" : "No goals or missing read_goals scope"}
          tone={goalRows.length > 0 && onTrackGoals === goalRows.length ? "success" : "default"}
        />
        <StatCard
          label="All Time"
          value={report.allTime?.data.text ?? "-"}
          foot={`Today: ${report.today?.data.text ?? "0m"}${report.today ? ` since ${formatTime(report.today.data.range.start)}` : ""}`}
          tone="info"
        />
      </div>

      {dailyTrend.length > 0 && (
        <div className="reports-charts-grid reports-charts-row-2">
          <div className="card report-panel">
            <div className="report-panel-head">
              <h3>Daily Coding Trend</h3>
              <span className="report-panel-badge">{dailyTrend.length} days</span>
            </div>
            <AreaChart
              points={dailyTrend}
              stroke="#0f6f87"
              fill="#34d399"
              height={140}
              tooltipLabel={(k, v) => `${formatDay(k)}: ${v}h`}
            />
          </div>

          <div className="card report-panel">
            <div className="report-panel-head">
              <h3>Daily Performance</h3>
              <span className="report-panel-badge">{gaugePercent}% of average</span>
            </div>
            <div className="wakatime-gauge-panel">
              <svg viewBox="0 0 220 140" className="wakatime-gauge-svg" role="img" aria-label="Today vs average coding time gauge">
                <path
                  d="M 20 120 A 90 90 0 0 1 200 120"
                  fill="none"
                  stroke="#dbe6ef"
                  strokeWidth="20"
                  strokeLinecap="round"
                  pathLength={100}
                />
                <path
                  d="M 20 120 A 90 90 0 0 1 200 120"
                  fill="none"
                  stroke={gaugePercent >= 100 ? "#34d399" : "#fbbf24"}
                  strokeWidth="20"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${gaugePercent} 100`}
                />
              </svg>
              <div className="wakatime-gauge-copy">
                <div className="wakatime-gauge-today">
                  <strong>{report.today?.data.text ?? "0m"}</strong> today
                </div>
                <div className={`wakatime-gauge-delta ${deltaPercent >= 0 ? "up" : "down"}`}>
                  {deltaPercent >= 0 ? "↑" : "↓"} {Math.abs(deltaPercent)}% vs daily average
                </div>
                <div className="wakatime-gauge-meta">
                  Daily avg: <strong>{hoursLabel(dailyAverageSeconds)}</strong>
                </div>
                <div className="wakatime-gauge-meta">
                  Most active: <strong>{topDays[0] ? formatDay(topDays[0].range.start) : "n/a"}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="reports-charts-grid reports-charts-row-3 wakatime-bottom-grid">
        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Languages</h3>
            <span className="report-panel-badge">{(d.languages ?? []).filter((l) => l.total_seconds > 0).length}</span>
          </div>
          <DonutChart
            segments={toSegments(d.languages)}
            centerLabel="Hours"
            centerValue={roundHours(d.total_seconds)}
          />
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Projects</h3>
            <span className="report-panel-badge">top 8</span>
          </div>
          <BarChartEnhanced items={toBarItems(d.projects)} showValue />
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Editors</h3>
            <span className="report-panel-badge">{(d.editors ?? []).filter((e) => e.total_seconds > 0).length}</span>
          </div>
          <DonutChart
            segments={toSegments(d.editors)}
            centerLabel="Top"
            centerValue={d.editors?.[0]?.name ?? "-"}
          />
        </div>
      </div>

      <div className="reports-charts-grid reports-charts-row-3">
        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Weekday Activity Mix</h3>
            <span className="report-panel-badge">
              {weekdayActivityMix.mode === "heartbeats" ? "heartbeats (7d)" : "summaries fallback"}
            </span>
          </div>
          {weekdayMixRows.length > 0 ? (
            <>
              <div className="wakatime-weekday-mix">
                <div className="wakatime-weekday-bars" onMouseLeave={() => setHoveredWeekday(null)}>
                  {weekdayMixRows.map((row) => (
                    <button
                      key={row.label}
                      type="button"
                      className="wakatime-weekday-row"
                      onMouseEnter={() => setHoveredWeekday(row.label)}
                      onFocus={() => setHoveredWeekday(row.label)}
                    >
                      <span className="wakatime-weekday-label">{row.label}</span>
                      <span className="wakatime-weekday-track">
                        {row.items.map((item) => (
                          <span
                            key={`${row.label}-${item.name}`}
                            className="wakatime-weekday-segment"
                            style={{
                              width: `${row.total > 0 ? (item.value / row.total) * 100 : 0}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>

                {activeWeekdayRow && (
                  <aside className="wakatime-weekday-tooltip">
                    <div className="wakatime-weekday-tooltip-head">{activeWeekdayRow.label}</div>
                    {activeWeekdayRow.items.map((item) => (
                      <div key={item.name} className="wakatime-weekday-tooltip-row">
                        <span className="wakatime-weekday-tooltip-name">
                          <span className="wakatime-weekday-tooltip-dot" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </span>
                        <span className="wakatime-weekday-tooltip-value">
                          {formatMixValue(item.value, weekdayActivityMix.mode)}
                        </span>
                      </div>
                    ))}
                  </aside>
                )}
              </div>
              {weekdayActivityMix.missingHeartbeatsScope && weekdayActivityMix.mode !== "heartbeats" && (
                <p className="muted wakatime-scope-note">
                  Heartbeats unavailable. Add <code>read_heartbeats</code> scope to power this with raw activity.
                </p>
              )}
            </>
          ) : (
            <p className="muted">No activity mix data available.</p>
          )}
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Goals Progress</h3>
            <span className="report-panel-badge">{goalRows.length} active</span>
          </div>
          {goalRows.length > 0 ? (
            <div className="wakatime-goals-list">
              {goalRows.map((goal) => (
                <div key={goal.id} className="wakatime-goal-row">
                  <div className="wakatime-goal-top">
                    <span className="wakatime-goal-title">{goal.title}</span>
                    <span className={`wakatime-goal-status status-${goal.status.toLowerCase()}`}>{goal.status}</span>
                  </div>
                  <div className="wakatime-goal-meta muted">
                    {goal.actualText} / {goal.targetText} · {goal.cadence}
                  </div>
                  <div className="wakatime-goal-track">
                    <div className="wakatime-goal-fill" style={{ width: `${goal.progress ?? 0}%` }} />
                  </div>
                  {goal.reason && <div className="wakatime-goal-reason muted">{goal.reason}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="wakatime-empty-state">
              <p className="muted">Goals unavailable. Confirm your key has <code>read_goals</code> access and a WakaTime premium plan.</p>
            </div>
          )}
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Top Coding Days</h3>
            <span className="report-panel-badge">{topDays.length} entries</span>
          </div>
          {topDays.length > 0 ? (
            <div className="wakatime-top-days">
              {topDays.map((day) => (
                <div key={day.id} className="wakatime-top-day-row">
                  <div className="wakatime-top-day-main">
                    <span className="wakatime-top-day-date">{formatDay(day.range.start)}</span>
                    <span className="wakatime-top-day-total">{day.grand_total.text}</span>
                  </div>
                  <div className="wakatime-top-day-sub muted">
                    {day.languages[0]?.name ?? "No language"}
                    {day.projects[0]?.name ? ` • ${day.projects[0].name}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="wakatime-empty-state">
              <p className="muted">No coding days found for this range.</p>
              <div className="wakatime-empty-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleRangeChange("last_30_days")}
                  disabled={busy || selectedRange === "last_30_days"}
                >
                  Try Last 30 Days
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
