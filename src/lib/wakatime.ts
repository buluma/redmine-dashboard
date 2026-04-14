/**
 * WakaTime API Client
 *
 * Server-side only — never import this in "use client" files.
 * Uses Next.js fetch caching with 5-minute revalidation.
 */

import https from 'https';

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

  private async get<T>(path: string): Promise<T> {
    // Build URL - if path already has query params, use &, otherwise use ?
    const separator = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${separator}api_key=${this.apiKey}`;
    console.log('[WakaTime] Fetching:', url.replace(this.apiKey, '***'));

    try {
      // Force IPv4 by using Node's https module directly with family=4
      const result = await this.httpsGet(url);
      console.log('[WakaTime] Response status:', result.status);

      if (result.status === 401) {
        throw new Error("WakaTime API key is invalid. Check your WAKATIME_API_KEY.");
      }
      if (result.status === 429) {
        throw new Error("WakaTime rate limit exceeded. Try again in a few minutes.");
      }
      if (result.status === 202) {
        throw new Error("WakaTime stats are still calculating. Try again shortly.");
      }
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`WakaTime API error (${result.status}): ${result.body.substring(0, 100)}`);
      }

      return JSON.parse(result.body) as T;
    } catch (err: any) {
      // Determine if it's a network/connection error
      const isNetworkError = err.cause?.code === 'ETIMEDOUT' || 
                             err.cause?.code === 'EHOSTUNREACH' || 
                             err.cause?.code === 'ECONNREFUSED' ||
                             err.message?.includes('fetch failed');
      
      if (isNetworkError) {
        console.error('[WakaTime] Network connectivity issue:', err.cause?.code || err.message);
        throw new Error(`Network error: Cannot reach WakaTime API. Check firewall/VPN settings.`);
      }
      
      console.error('[WakaTime] Fetch error:', err.message);
      throw new Error(`fetch failed: ${err.message}`);
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
