// Client-safe constants shared between src/lib/wakatime.ts (server-only —
// see its own header comment) and "use client" files (app/wakatime,
// app/correlation). Keep this file free of server-only imports (https,
// http, telemetry, db, env, etc.) — anything it pulls in gets bundled into
// the client.

export const WAKATIME_RANGE_OPTIONS = [
  { label: "Today", value: "today", days: 1 },
  { label: "Yesterday", value: "yesterday", days: 1 },
  { label: "Last 7 Days", value: "last_7_days", days: 7 },
  { label: "Last 30 Days", value: "last_30_days", days: 30 },
  { label: "Last 6 Months", value: "last_6_months", days: 180 },
  { label: "Last Year", value: "last_year", days: 365 },
] as const;

export type WakaTimeRange = (typeof WAKATIME_RANGE_OPTIONS)[number]["value"];

export const DEFAULT_WAKATIME_RANGE: WakaTimeRange = "last_7_days";

/** Chart color palette */
export const CHART_COLORS = [
  "#006d77", "#00515a", "#34d399", "#fbbf24", "#f87171",
  "#38bdf8", "#fb923c", "#a3e635", "#e879f9", "#06b6d4",
  "#84cc16", "#f43f5e", "#14b8a6", "#eab308", "#10b981",
];
