/**
 * WakaTime API Client
 *
 * Server-side only — never import this in "use client" files.
 * Uses Next.js fetch caching with 5-minute revalidation.
 */

import https from 'https';
import { trackInfo, trackFailure } from '@/src/lib/telemetry';

export const WAKATIME_RANGE_OPTIONS = [
  { label: "Last 7 Days", value: "last_7_days", days: 7 },
  { label: "Last 30 Days", value: "last_30_days", days: 30 },
  { label: "Last 6 Months", value: "last_6_months", days: 180 },
  { label: "Last Year", value: "last_year", days: 365 },
] as const;

export type WakaTimeRange = (typeof WAKATIME_RANGE_OPTIONS)[number]["value"];

export const DEFAULT_WAKATIME_RANGE: WakaTimeRange = "last_7_days";

const WAKATIME_RANGE_DAYS: Record<WakaTimeRange, number> = WAKATIME_RANGE_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item.days;
    return acc;
  },
  {} as Record<WakaTimeRange, number>,
);

export function isWakaTimeRange(value: string | null | undefined): value is WakaTimeRange {
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(WAKATIME_RANGE_DAYS, value);
}

function asDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSummaryDateWindow(range: WakaTimeRange, now = new Date()): { start: string; end: string; days: number } {
  const days = WAKATIME_RANGE_DAYS[range] ?? 7;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return {
    start: asDateOnlyLocal(start),
    end: asDateOnlyLocal(end),
    days,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface WakaTimeBreakdown {
  name: string;
  total_seconds: number;
  percent: number;
  hours: number;
  minutes: number;
  digital: string;
  decimal: string;
  text: string;
}

export interface WakaTimeStatsResponse {
  data: {
    id: string;
    username: string;
    range: { start: string; end: string; date_index: number };
    timeout: number;
    writes_only: boolean;
    timezone: string;
    holidays: number;
    total_seconds: number;
    daily_average: number;
    daily_average_including_other_language: number;
    days_including_holidays: number;
    days_minus_holidays: number;
    edited_at: string;
    languages: WakaTimeBreakdown[];
    projects: WakaTimeBreakdown[];
    editors: WakaTimeBreakdown[];
    operating_systems: WakaTimeBreakdown[];
    categories: WakaTimeBreakdown[];
    machines: WakaTimeBreakdown[];
  };
}

export interface WakaTimeSummaryDay {
  id: string;
  range: { start: string; end: string; date_index: number };
  grand_total: { total_seconds: number; text: string; digital: string };
  categories: WakaTimeBreakdown[];
  projects: WakaTimeBreakdown[];
  languages: WakaTimeBreakdown[];
  editors: WakaTimeBreakdown[];
  operating_systems: WakaTimeBreakdown[];
}

export interface WakaTimeSummariesResponse {
  data: {
    start: string;
    end: string;
    range: string;
    timeout: number;
    writes_only: boolean;
    holidays: number;
    days_including_holidays: number;
    days_minus_holidays: number;
    total_seconds: number;
    daily_average: number;
    best_day: { id: string; total_seconds: number; text: string; digital: string };
    average_days_including_holidays: number;
    days_without_logging: number;
    human_readable_total: string;
    human_readable_daily_average: string;
    sum_of_daily_averages: number;
    summaries: WakaTimeSummaryDay[];
  };
}

export interface WakaTimeAllTimeResponse {
  data: {
    id: string;
    user_id: string;
    total_seconds: number;
    text: string;
    digital: string;
    decimal: string;
    is_up_to_date: boolean;
    is_including_today: boolean;
    range: { start: string; end: string };
    timeout: number;
  };
}

export interface WakaTimeTodayResponse {
  data: {
    id: string;
    kind: string;
    user_id: string;
    range: { date: string; start: string; end: string };
    total_seconds: number;
    text: string;
    digital: string;
    decimal: string;
  };
}

export interface WakaTimeHeartbeat {
  entity?: string;
  type?: string;
  time: number;
  project?: string;
  branch?: string;
  language?: string;
  category?: string;
  is_write?: boolean;
}

export interface WakaTimeHeartbeatsResponse {
  data: WakaTimeHeartbeat[];
  start?: string;
  end?: string;
  timezone?: string;
}

export type WakaTimeInsightType =
  | "weekdays"
  | "weekday"
  | "days"
  | "best_day"
  | "daily_average"
  | "projects"
  | "languages"
  | "editors"
  | "categories"
  | "machines"
  | "operating_systems";

export interface WakaTimeInsightsResponse {
  data: {
    range?: string;
    human_readable_range?: string;
    status?: string;
    is_including_today?: boolean;
    is_up_to_date?: boolean;
    percent_calculated?: number;
    start?: string;
    end?: string;
    timezone?: string;
    timeout?: number;
    writes_only?: boolean;
    user_id?: string;
    created_at?: string;
    modified_at?: string;
    [key: string]: unknown;
  };
}

export interface WakaTimeGoalChartPoint {
  actual_seconds?: number;
  actual_seconds_text?: string;
  goal_seconds?: number;
  goal_seconds_text?: string;
  range_status?: "success" | "fail" | "pending" | "ignored" | string;
  range_status_reason?: string;
  range?: {
    date?: string;
    start?: string;
    end?: string;
    text?: string;
    timezone?: string;
  };
}

export interface WakaTimeGoal {
  id: string;
  title?: string;
  custom_title?: string;
  type?: string;
  delta?: "day" | "week" | string;
  status?: "success" | "fail" | "pending" | "ignored" | string;
  average_status?: "success" | "fail" | string;
  cumulative_status?: "success" | "fail" | "ignored" | string;
  status_percent_calculated?: number;
  is_enabled?: boolean;
  is_inverse?: boolean;
  created_at?: string;
  chart_data?: WakaTimeGoalChartPoint[];
}

export interface WakaTimeGoalsResponse {
  data: WakaTimeGoal[];
}

export interface WakaTimeReportPayload {
  range: WakaTimeRange;
  generatedAt: string;
  stats: WakaTimeStatsResponse;
  summaries: WakaTimeSummariesResponse | null;
  allTime: WakaTimeAllTimeResponse | null;
  today: WakaTimeTodayResponse | null;
  insights: {
    weekday: WakaTimeInsightsResponse | null;
  };
  goals: WakaTimeGoalsResponse | null;
  heartbeats: {
    start: string;
    end: string;
    days: Array<{
      date: string;
      data: WakaTimeHeartbeatsResponse | null;
    }>;
  };
}

export class WakaTimeApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `WakaTime API error (${status})`);
    this.name = 'WakaTimeApiError';
    this.status = status;
    this.body = body;
  }
}

export function isWakaTimeApiError(err: unknown): err is WakaTimeApiError {
  return err instanceof WakaTimeApiError;
}

// ─── Client ──────────────────────────────────────────────────────────────

const BASE = "https://api.wakatime.com/api/v1";

export class WakaTimeClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("WakaTime API key not configured. Set WAKATIME_API_KEY in your environment.");
    }
    this.apiKey = apiKey;
  }

  private async get<T>(path: string, options?: { quiet?: boolean }): Promise<T> {
    const quiet = Boolean(options?.quiet);
    // Build URL - if path already has query params, use &, otherwise use ?
    const separator = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${separator}api_key=${this.apiKey}`;
    if (!quiet) {
      trackInfo("wakatime.fetch.started", { path });
    }

    try {
      // Force IPv4 by using Node's https module directly with family=4
      const result = await this.httpsGet(url);
      if (!quiet) {
        trackInfo("wakatime.fetch.completed", { status: result.status });
      }

      if (result.status === 401) {
        throw new WakaTimeApiError(
          401,
          result.body,
          "WakaTime API key is invalid. Check your WAKATIME_API_KEY.",
        );
      }
      if (result.status === 429) {
        throw new WakaTimeApiError(
          429,
          result.body,
          "WakaTime rate limit exceeded. Try again in a few minutes.",
        );
      }
      if (result.status === 202) {
        throw new WakaTimeApiError(
          202,
          result.body,
          "WakaTime stats are still calculating. Try again shortly.",
        );
      }
      if (result.status < 200 || result.status >= 300) {
        throw new WakaTimeApiError(
          result.status,
          result.body,
          `WakaTime API error (${result.status}): ${result.body.substring(0, 100)}`,
        );
      }

      return JSON.parse(result.body) as T;
    } catch (err: unknown) {
      if (err instanceof WakaTimeApiError) {
        // Optional endpoints may fail for plan/scope reasons; caller decides handling.
        if (!quiet && err.status >= 500) {
          trackFailure({ event: "wakatime.api.error", error: err, metricName: "wakatime_api_error", metricTags: { status_class: "5xx" } });
        }
        throw err;
      }

      const message = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause : undefined;
      const causeCode = cause?.code;
      // Determine if it's a network/connection error
      const isNetworkError = causeCode === 'ETIMEDOUT' || 
                             causeCode === 'EHOSTUNREACH' || 
                             causeCode === 'ECONNREFUSED' ||
                             message.includes('fetch failed');
      
      if (isNetworkError) {
        if (!quiet) {
          trackFailure({ event: "wakatime.network.error", error: err instanceof Error ? err : new Error(message), metricName: "wakatime_network_error" });
        }
        throw new Error(`Network error: Cannot reach WakaTime API. Check firewall/VPN settings.`);
      }

      if (!quiet) {
        trackFailure({ event: "wakatime.fetch.failed", error: err instanceof Error ? err : new Error(message), metricName: "wakatime_fetch_failed" });
      }
      throw new Error(`fetch failed: ${message}`);
    }
  }

  /**
   * Helper method to make HTTP requests using Node.js https with IPv4 forcing
   */
  private httpsGet(url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      // Create a custom agent with IPv4 only and proper TLS settings
      const agent = new https.Agent({
        family: 4,  // Force IPv4 only
        keepAlive: true,
        keepAliveMsecs: 30000,
        timeout: 15000,
        // Allow older TLS versions that some servers might need
        secureProtocol: 'TLSv1_2_method',
      });

      const req = https.get(url, {
        agent,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'redmine-dashboard/1.0',
          'Accept': 'application/json',
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          agent.destroy();  // Close the agent when done
          resolve({ status: res.statusCode || 0, body });
        });
      });
      
      req.on('error', (e) => { agent.destroy(); reject(e); });
      req.on('timeout', () => { req.destroy(); agent.destroy(); reject(new Error('Request timeout')); });
      req.end();
    });
  }

  /**
   * Get coding stats for a range.
   * @param range - "last_7_days", "last_30_days", "last_6_months", "last_year", or omit for default
   */
  getStats(range?: string): Promise<WakaTimeStatsResponse> {
    const path = range ? `/users/current/stats/${range}` : "/users/current/stats";
    return this.get(path);
  }

  /**
   * Get daily summaries for a date range or named range.
   */
  getSummaries(params: { start?: string; end?: string; range?: string }): Promise<WakaTimeSummariesResponse> {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][]
    ).toString();
    return this.get(`/users/current/summaries?${qs}`);
  }

  /** Total coding time since account creation. */
  getAllTimeSinceToday(): Promise<WakaTimeAllTimeResponse> {
    return this.get("/users/current/all_time_since_today");
  }

  /** Today's coding time (optimized for status bars). */
  getTodayStatusBar(): Promise<WakaTimeTodayResponse> {
    return this.get("/users/current/status_bar/today");
  }

  /** Raw heartbeats for a given day (requires read_heartbeats scope). */
  getHeartbeats(date: string, options?: { quiet?: boolean }): Promise<WakaTimeHeartbeatsResponse> {
    return this.get(`/users/current/heartbeats?date=${encodeURIComponent(date)}`, options);
  }

  /** List user goals. */
  getGoals(options?: { quiet?: boolean }): Promise<WakaTimeGoalsResponse> {
    return this.get("/users/current/goals", options);
  }

  /** Fetch a single insight for a given range. */
  getInsights(
    insightType: WakaTimeInsightType,
    range: WakaTimeRange | "all_time" | string,
    options?: { quiet?: boolean },
  ): Promise<WakaTimeInsightsResponse> {
    return this.get(
      `/users/current/insights/${encodeURIComponent(insightType)}/${encodeURIComponent(range)}`,
      options,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Format seconds to human-readable string like "4h 23m" */
export function formatSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Chart color palette */
export const CHART_COLORS = [
  "#006d77", "#00515a", "#34d399", "#fbbf24", "#f87171",
  "#38bdf8", "#fb923c", "#a3e635", "#e879f9", "#06b6d4",
  "#84cc16", "#f43f5e", "#14b8a6", "#eab308", "#10b981",
];
