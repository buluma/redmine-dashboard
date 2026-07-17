import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Tripwire against the failure mode that produced the /api/ai/search IDOR: a new
// API route shipping with no authentication check at all. This does NOT prove a
// route enforces auth correctly — only that it references one of the auth
// helpers (or is a deliberately public route on the allowlist below). A route
// that appears in neither fails the build, forcing a conscious decision.
//
// When you add a genuinely public route, add it to PUBLIC_ROUTES with a reason.
// When you add a protected route, just use one of the auth helpers as usual.

const API_DIR = path.resolve(__dirname, "..");

// Substrings that indicate the route consults an auth mechanism. Keep in sync
// with src/lib/auth.ts, src/lib/rbac.ts, src/lib/external-auth.ts,
// src/lib/mobile-auth.ts.
const AUTH_MARKERS = [
  "requireCurrentUser",
  "getAuthenticatedUserId",
  "getSessionUserId",
  "requireRole",
  "requirePermission",
  "checkPermissionOrThrow",
  "requireRedmineClient",
  "requireRedmineClientForUser",
  "requireExternalApiKey",
  "validateExternalApiKey",
  "verifyMobileToken",
  "requireMobileUser",
];

// Routes that are public by design. Path is relative to app/api/.
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "Liveness/health probe — must answer without a session.",
  "redmine/connect/route.ts": "Login. Rate-limited per IP instead of session-gated.",
  "redmine/bootstrap/route.ts": "First-run only — self-gates on activeCredentials === 0.",
  "mobile/v1/pair/connect/route.ts": "Mobile pairing (login). Rate-limited per base URL.",
  "openapi/route.ts": "Public OpenAPI spec document.",
  "ai/status/route.ts": "AI provider health + feature flags. No user data or secrets.",
  "metrics/route.ts": "Monitoring counts for scrapers that cannot send a session cookie.",
  "metrics/prometheus/route.ts": "Prometheus scrape endpoint — same rationale as metrics.",
};

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

describe("API route auth guard", () => {
  const routeFiles = findRouteFiles(API_DIR);

  it("discovers the route files", () => {
    expect(routeFiles.length).toBeGreaterThan(50);
  });

  it("every route either checks auth or is an explicitly-allowlisted public route", () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const rel = path.relative(API_DIR, file);
      const source = readFileSync(file, "utf8");
      const hasAuth = AUTH_MARKERS.some((marker) => source.includes(marker));
      const isPublic = rel in PUBLIC_ROUTES;

      if (!hasAuth && !isPublic) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `These API routes reference no auth helper and are not on the public allowlist:\n` +
        offenders.map((o) => `  - ${o}`).join("\n") +
        `\n\nAdd an auth check, or add the route to PUBLIC_ROUTES with a reason.`,
    ).toEqual([]);
  });

  it("has no stale entries in the public allowlist", () => {
    const stale = Object.keys(PUBLIC_ROUTES).filter(
      (rel) => !routeFiles.some((f) => path.relative(API_DIR, f) === rel),
    );
    expect(stale, `PUBLIC_ROUTES lists routes that no longer exist: ${stale.join(", ")}`).toEqual([]);
  });
});
