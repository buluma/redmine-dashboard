// Client-safe constants shared between src/lib/correlation.ts (server) and
// app/correlation/correlation-client.tsx ("use client"). Keep this file free
// of server-only imports (db, env, etc.) — anything it pulls in gets bundled
// into the client.

// Below this, a day's growth since it was last logged is treated as float
// noise from the two-decimal rounding on both sides, not real new work.
export const MIN_HOURS_GROWTH = 0.005;
