"use client";

import { useState, useMemo, type ReactNode } from "react";

// ─── Area Chart (Sparkline replacement with tooltip) ───────────────────

export function AreaChart({
  points,
  stroke,
  fill,
  height = 100,
  tooltipLabel,
  onClick,
}: {
  points: { key: string; value: number }[];
  stroke: string;
  fill: string;
  height?: number;
  tooltipLabel?: (key: string, value: number) => string;
  onClick?: (key: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const width = 400;
  const pad = 12;
  const chartH = height - pad * 2;
  const max = Math.max(...points.map((p) => p.value), 1);

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1),
        y: pad + chartH - (p.value / max) * chartH,
        key: p.key,
        value: p.value,
      })),
    [points, max, chartH, width, pad],
  );

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = [
    `${pad},${pad + chartH}`,
    ...coords.map((c) => `${c.x},${c.y}`),
    `${width - pad},${pad + chartH}`,
  ].join(" ");

  const gradId = `area-${stroke.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="area-chart-wrapper" style={{ position: "relative" }}>
      <svg
        className="area-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        onMouseLeave={() => setActiveIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.45" />
            <stop offset="100%" stopColor={fill} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad}
            y1={pad + chartH * (1 - f)}
            x2={width - pad}
            y2={pad + chartH * (1 - f)}
            stroke="#e5e7eb"
            strokeWidth="0.5"
            strokeDasharray="3,3"
          />
        ))}

        <polyline points={area} fill={`url(#${gradId})`} stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c, i) => (
          <g key={c.key}>
            <circle
              cx={c.x}
              cy={c.y}
              r={activeIdx === i ? 5 : 0}
              fill="white"
              stroke={stroke}
              strokeWidth="2.5"
              style={{ transition: "r 0.15s ease" }}
            />
            <circle
              cx={c.x}
              cy={c.y}
              r="12"
              fill="transparent"
              style={{ cursor: onClick ? "pointer" : "default" }}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onClick?.(c.key)}
            />
          </g>
        ))}
      </svg>

      {activeIdx !== null && coords[activeIdx] && (
        <div
          className="area-chart-tooltip"
          style={{
            position: "absolute",
            left: `${(coords[activeIdx].x / width) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          {tooltipLabel?.(coords[activeIdx].key, coords[activeIdx].value) ??
            `${coords[activeIdx].key}: ${coords[activeIdx].value}`}
        </div>
      )}
    </div>
  );
}

// ─── Donut Chart ────────────────────────────────────────────────────────

export function DonutChart({
  segments,
  size = 140,
  strokeWidth = 22,
  centerLabel,
  centerValue,
  onClick,
}: {
  segments: { name: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string | number;
  onClick?: (name: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  const arcs = segments.reduce(
    (acc, seg) => {
      const fraction = total > 0 ? seg.value / total : 0;
      const dashLen = fraction * circumference;
      const gap = circumference - dashLen;
      const offset = -acc.accumulated * circumference;
      acc.accumulated += fraction;
      acc.arcs.push({ ...seg, dashLen, gap, offset, fraction });
      return acc;
    },
    { accumulated: 0, arcs: [] as Array<typeof segments[number] & { dashLen: number; gap: number; offset: number; fraction: number }> },
  ).arcs;

  return (
    <div className="donut-chart">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="donut-svg"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#f3f4f6"
          strokeWidth={strokeWidth}
        />

        {arcs.map((arc) => (
          <circle
            key={arc.name}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={hovered === arc.name ? strokeWidth + 4 : strokeWidth}
            strokeDasharray={`${arc.dashLen} ${arc.gap}`}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: "stroke-width 0.15s ease, opacity 0.15s ease",
              opacity: hovered && hovered !== arc.name ? 0.45 : 1,
              cursor: onClick ? "pointer" : "default",
            }}
            onMouseEnter={() => setHovered(arc.name)}
            onClick={() => onClick?.(arc.name)}
          />
        ))}

        {centerLabel && (
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="donut-center-label"
          >
            {centerLabel}
          </text>
        )}
        {centerValue !== undefined && (
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            className="donut-center-value"
          >
            {centerValue}
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="donut-legend">
        {segments.map((seg) => (
          <button
            key={seg.name}
            type="button"
            className={`donut-legend-item ${hovered === seg.name ? "active" : ""}`}
            onMouseEnter={() => setHovered(seg.name)}
            onClick={() => onClick?.(seg.name)}
          >
            <span
              className="donut-legend-dot"
              style={{ backgroundColor: seg.color }}
            />
            <span className="donut-legend-name">{seg.name}</span>
            <span className="donut-legend-value">{seg.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Enhanced Bar Chart ─────────────────────────────────────────────────

export function BarChartEnhanced({
  items,
  colors,
  onClick,
  active,
  showValue = true,
}: {
  items: { name: string; value: number }[];
  colors?: string[];
  onClick?: (name: string) => void;
  active?: string;
  showValue?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const palette =
    colors ?? [
      "#006d77",
      "#00515a",
      "#34d399",
      "#fbbf24",
      "#f87171",
      "#38bdf8",
      "#fb923c",
      "#a3e635",
      "#e879f9",
    ];

  return (
    <div className="bar-chart-enhanced">
      {items.map((item, i) => (
        <button
          key={item.name}
          type="button"
          className={`bar-row-enhanced ${active === item.name ? "active" : ""}`}
          onClick={() => onClick?.(item.name)}
        >
          <span className="bar-label-enhanced">{item.name}</span>
          <div className="bar-track-enhanced">
            <div
              className="bar-fill-enhanced"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                background: `linear-gradient(90deg, ${palette[i % palette.length]}, ${palette[(i + 1) % palette.length]})`,
              }}
            />
          </div>
          {showValue && <span className="bar-value-enhanced">{item.value}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  foot,
  icon,
  tone = "default",
  trend,
}: {
  label: string;
  value: ReactNode;
  foot?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  trend?: { value: number; label: string };
}) {
  const toneMap = {
    default: "",
    success: "tone-success",
    warning: "tone-warning",
    danger: "tone-danger",
    info: "tone-info",
  };

  return (
    <div className={`stat-card ${toneMap[tone]}`}>
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
      {trend && (
        <div
          className={`stat-trend ${trend.value >= 0 ? "up" : "down"}`}
        >
          {trend.label}
        </div>
      )}
    </div>
  );
}

// ─── Progress Ring ──────────────────────────────────────────────────────

export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 5,
  color = "#006d77",
}: {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ─── Stacked Bar Chart ──────────────────────────────────────────────────

export function StackedBarChart({
  series,
  colors,
  onClick,
  showValue = true,
  fillWidth = false,
}: {
  series: { name: string; data: { label: string; value: number }[] }[];
  colors?: string[];
  onClick?: (seriesName: string, label: string, value: number) => void;
  showValue?: boolean;
  /** When true, each row's segments are sized as a share of that row's own
   * total (always filling the track) instead of relative to the max total
   * across all rows — trades magnitude-at-a-glance for a filled bar. */
  fillWidth?: boolean;
}) {
  // Get all unique labels (dates)
  const labels = Array.from(
    new Set(series.flatMap(s => s.data.map(d => d.label)))
  ).sort();

  // Calculate totals for each label
  const totals: Record<string, number> = {};
  labels.forEach(label => {
    totals[label] = series.reduce((sum, s) => {
      const item = s.data.find(d => d.label === label);
      return sum + (item?.value ?? 0);
    }, 0);
  });

  const maxTotal = Math.max(...Object.values(totals), 1);
  const palette =
    colors ?? [
      "#006d77",
      "#10b981",
      "#f59e0b",
      "#00515a",
      "#34d399",
      "#f87171",
      "#38bdf8",
      "#fb923c",
      "#a3e635",
      "#e879f9",
    ];

  return (
    <div className="stacked-bar-chart">
      {labels.map((label) => (
        <div
          key={label}
          className="stacked-bar-row"
          onMouseEnter={() => {
            // Handle hover state if needed
          }}
          onMouseLeave={() => {
            // Handle hover state if needed
          }}
        >
          <div className="stacked-bar-label">{label}</div>
          <div className="stacked-bar-track">
            {series.map((serie, serieIndex) => {
              const item = serie.data.find(d => d.label === label);
              const value = item?.value ?? 0;
              const denominator = fillWidth ? totals[label] : maxTotal;
              const percentage = denominator > 0 ? (value / denominator) * 100 : 0;
              
              return (
                <div
                  key={serie.name}
                  className="stacked-bar-segment"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: palette[serieIndex % palette.length],
                  }}
                  onClick={() => onClick?.(serie.name, label, value)}
                  title={`${serie.name}: ${value} (${label})`}
                >
                  {showValue && value > 0 && (
                    <div className="stacked-bar-value">{value}</div>
                  )}
                </div>
              );
            })}
          </div>
          {showValue && totals[label] > 0 && (
            <div className="stacked-bar-total">{totals[label]}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Burndown Chart ─────────────────────────────────────────────────────

interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export function BurndownChart({
  points,
  totalPoints,
  startDate: _startDate,
  endDate: _endDate,
}: {
  points: BurndownPoint[];
  totalPoints: number;
  startDate: string;
  endDate: string;
}) {
  if (points.length === 0) {
    return (
      <div className="burndown-empty">
        <p className="muted">No sprint data available</p>
      </div>
    );
  }

  const width = 500;
  const height = 200;
  const pad = 30;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;
  
  const maxVal = Math.max(totalPoints, 1);
  const dayCount = points.length;
  
  // Calculate ideal slope
  const idealPoints = points.map((_, i) => ({
    x: pad + (i / Math.max(1, dayCount - 1)) * chartW,
    y: pad + chartH - (totalPoints - (totalPoints / dayCount) * i) / maxVal * chartH,
  }));
  
  // Calculate actual remaining line
  const actualCoords = points.map((p, i) => ({
    x: pad + (i / Math.max(1, dayCount - 1)) * chartW,
    y: pad + chartH - (p.remaining / maxVal) * chartH,
    date: p.date,
    remaining: p.remaining,
  }));
  
  const idealLine = idealPoints.map(p => `${p.x},${p.y}`).join(" ");
  const actualLine = actualCoords.map(p => `${p.x},${p.y}`).join(" ");
  
  return (
    <div className="burndown-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="burndown-svg">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line
            key={i}
            x1={pad}
            y1={pad + chartH * t}
            x2={width - pad}
            y2={pad + chartH * t}
            stroke="var(--line)"
            strokeDasharray="4,4"
          />
        ))}
        
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <text
            key={i}
            x={pad - 5}
            y={pad + chartH * t + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--text-soft)"
          >
            {Math.round(maxVal * (1 - t))}
          </text>
        ))}
        
        {/* Ideal line */}
        <polyline
          points={idealLine}
          fill="none"
          stroke="var(--text-soft)"
          strokeWidth={2}
          strokeDasharray="6,4"
          opacity={0.5}
        />
        
        {/* Actual remaining line */}
        <polyline
          points={actualLine}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3}
        />
        
        {/* Data points */}
        {actualCoords.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill="var(--accent)"
            />
            <title>{`${p.date}: ${p.remaining} remaining`}</title>
          </g>
        ))}
        
        {/* X-axis labels (first, middle, last) */}
        {points.length > 0 && (
          <>
            <text x={pad} y={height - 5} fontSize="10" fill="var(--text-soft)">
              {points[0].date}
            </text>
            <text x={width / 2} y={height - 5} fontSize="10" fill="var(--text-soft)" textAnchor="middle">
              {points[Math.floor(points.length / 2)]?.date}
            </text>
            <text x={width - pad} y={height - 5} fontSize="10" fill="var(--text-soft)" textAnchor="end">
              {points[points.length - 1]?.date}
            </text>
          </>
        )}
      </svg>
      
      <div className="burndown-legend">
        <span className="legend-item">
          <span className="legend-line ideal"></span>
          Ideal
        </span>
        <span className="legend-item">
          <span className="legend-line actual"></span>
          Remaining
        </span>
      </div>
      
      <style>{`
        .burndown-chart {
          padding: 1rem;
        }
        .burndown-svg {
          width: 100%;
          height: auto;
        }
        .burndown-legend {
          display: flex;
          gap: 1.5rem;
          justify-content: center;
          margin-top: 0.5rem;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--text-soft);
        }
        .legend-line {
          width: 20px;
          height: 3px;
          display: inline-block;
        }
        .legend-line.ideal {
          background: var(--text-soft);
          opacity: 0.5;
          border-style: dashed;
        }
        .legend-line.actual {
          background: var(--accent);
        }
        .burndown-empty {
          text-align: center;
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}
