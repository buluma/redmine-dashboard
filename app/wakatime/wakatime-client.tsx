"use client";

import { useState, useMemo } from "react";
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
} from "@/src/lib/wakatime";
import { CHART_COLORS } from "@/src/lib/wakatime";

type Props = {
  stats: WakaTimeStatsResponse;
  summaries: WakaTimeSummariesResponse | null;
  allTime: WakaTimeAllTimeResponse | null;
  today: WakaTimeTodayResponse | null;
};

const RANGES = [
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Last 6 Months", value: "last_6_months" },
  { label: "Last Year", value: "last_year" },
] as const;

export function WakatimeChartsClient({ stats, summaries, allTime, today }: Props) {
  const [range, setRange] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const d = stats.data;

  // Transform WakaTime breakdown → DonutChart segments
  const toSegments = (items: { name: string; total_seconds: number }[]) =>
    items
      .filter((x) => x.total_seconds > 0)
      .slice(0, 8)
      .map((x, i) => ({
        name: x.name || "Unknown",
        value: x.total_seconds,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));

  // Transform → BarChartEnhanced items
  const toBarItems = (items: { name: string; total_seconds: number }[]) =>
    items
      .filter((x) => x.total_seconds > 0)
      .slice(0, 8)
      .map((x) => ({
        name: x.name || "Unknown",
        value: Math.round(x.total_seconds / 3600 * 10) / 10, // hours with 1 decimal
      }));

  // Transform summaries → AreaChart points (daily trend)
  const dailyTrend = useMemo(() => {
    if (!summaries?.data?.summaries) return [];
    return summaries.data.summaries
      .filter((s) => s.grand_total.total_seconds > 0)
      .map((s) => ({
        key: s.range.end,
        value: Math.round(s.grand_total.total_seconds / 3600 * 10) / 10,
      }));
  }, [summaries]);

  const handleRangeChange = async (newRange: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/wakatime/stats?range=${newRange}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Note: In production you'd update state here. For now, just set the range.
      setRange(newRange);
    } catch {
      // Silently fail — user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Stat Cards */}
      <div className="reports-grid">
        <StatCard
          label="Total (All Time)"
          value={allTime?.data.text ?? "—"}
          foot={`${Math.round((allTime?.data.total_seconds ?? 0) / 3600)} hours total`}
          tone="info"
        />
        <StatCard
          label="Daily Average"
          value={`${Math.round(d.daily_average / 3600)}h ${Math.round((d.daily_average % 3600) / 60)}m`}
          foot={`${d.days_including_holidays} days tracked`}
          tone="success"
        />
        <StatCard
          label="Today"
          value={today?.data.text ?? "0m"}
          foot={today ? `Since ${today.data.range.start}` : "No data"}
          tone={today && today.data.total_seconds > 0 ? "success" : "default"}
        />
      </div>

      {/* Date Range Picker */}
      <div className="card" style={{ padding: "0.75rem 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Range:</span>
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRangeChange(r.value)}
              disabled={busy}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "20px",
                border: `1px solid ${(range || "last_7_days") === r.value ? "var(--accent, #e63946)" : "var(--border, #e0e0e0)"}`,
                background: (range || "last_7_days") === r.value ? "var(--accent, #e63946)" : "transparent",
                color: (range || "last_7_days") === r.value ? "#fff" : "var(--text, #222)",
                fontSize: "0.78rem",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: (range || "last_7_days") === r.value ? 600 : 400,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy && (range || "last_7_days") === r.value ? "Loading…" : r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Daily Trend */}
      {dailyTrend.length > 0 && (
        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Daily Coding Trend</h3>
            <span className="report-panel-badge">{dailyTrend.length} days</span>
          </div>
          <AreaChart
            points={dailyTrend}
            stroke="#006d77"
            fill="#00515a"
            height={120}
            tooltipLabel={(k, v) => `${k.slice(0, 10)}: ${v}h`}
          />
        </div>
      )}

      {/* Languages + Editors */}
      <div className="reports-charts-grid">
        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Languages</h3>
            <span className="report-panel-badge">{d.languages.filter((l) => l.total_seconds > 0).length} languages</span>
          </div>
          <DonutChart
            segments={toSegments(d.languages)}
            centerLabel="Total"
            centerValue={Math.round(d.total_seconds / 3600) + "h"}
          />
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Editors</h3>
            <span className="report-panel-badge">{d.editors.filter((e) => e.total_seconds > 0).length} editors</span>
          </div>
          <DonutChart
            segments={toSegments(d.editors)}
            centerLabel="Top"
            centerValue={d.editors[0]?.name ?? "—"}
          />
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Operating Systems</h3>
          </div>
          <DonutChart
            segments={toSegments(d.operating_systems)}
            centerLabel="OS"
            centerValue={d.operating_systems[0]?.name ?? "—"}
          />
        </div>
      </div>

      {/* Projects + Categories */}
      <div className="reports-charts-grid">
        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Projects (hours)</h3>
          </div>
          <BarChartEnhanced
            items={toBarItems(d.projects)}
            showValue
          />
        </div>

        <div className="card report-panel">
          <div className="report-panel-head">
            <h3>Categories (hours)</h3>
          </div>
          <BarChartEnhanced
            items={toBarItems(d.categories)}
            showValue
          />
        </div>
      </div>
    </>
  );
}
