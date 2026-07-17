import { test, expect } from "@playwright/test";

/**
 * E2E coverage for the security guarantees added in the hardening pass, exercised
 * through the real HTTP stack (proxy.ts + route handlers), not unit mocks:
 *
 *  - Routes that must reject anonymous callers return 401 (ai/search — the old
 *    IDOR — plus the slack surfaces and correlation).
 *  - slack/notify (external webhook) requires the external API key.
 *  - The CSRF proxy blocks a cookie-authenticated cross-origin mutation (403)
 *    while leaving same-origin, non-mutating, and bearer/no-cookie requests through.
 *  - The login endpoint is rate-limited per IP.
 *
 * These are all negative/edge paths that need no DB fixtures — only that the
 * server is up. A fake session cookie is enough to reach the proxy's CSRF check,
 * which runs on cookie presence + Origin before any route auth.
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const ORIGIN = new URL(BASE_URL).origin;
// Structurally valid but unsigned session token: present enough to trip the
// proxy's "has session cookie" branch, invalid enough that route auth rejects it.
const FAKE_SESSION = `rd_session=fake.${Math.floor(Date.now() / 1000) + 3600}.notarealsignature`;

test.describe("anonymous requests are rejected", () => {
  test("POST /api/ai/search returns 401 without auth (regression: was an IDOR)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/ai/search`, {
      data: { query: "anything" },
    });
    expect(res.status()).toBe(401);
  });

  test("GET /api/slack/messages returns 401 without a session", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/slack/messages`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/slack/thread returns 401 without a session", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/slack/thread?channelId=C1&threadTs=1`);
    expect(res.status()).toBe(401);
  });

  test("POST /api/slack/test returns 401 without a session", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/slack/test`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/correlation returns 401 without auth", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/correlation`);
    expect(res.status()).toBe(401);
  });
});

test.describe("slack/notify external webhook requires the API key", () => {
  test("rejects a missing key", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/slack/notify`, {
      data: { action: "test", issue: {} },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects an invalid key", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/slack/notify`, {
      headers: { "x-api-key": "not-a-real-key" },
      data: { action: "test", issue: {} },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("CSRF proxy", () => {
  test("blocks a cookie-authenticated cross-origin mutation (403)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/issues/1/status`, {
      headers: { cookie: FAKE_SESSION, origin: "https://evil.example" },
      data: { statusId: 2 },
    });
    expect(res.status()).toBe(403);
  });

  test("allows a same-origin cookie mutation through the proxy (not 403)", async ({ request }) => {
    // Passes the CSRF gate; route auth then rejects the fake cookie. Either way
    // the proxy must not 403 a legitimate same-origin request.
    const res = await request.post(`${BASE_URL}/api/issues/1/status`, {
      headers: { cookie: FAKE_SESSION, origin: ORIGIN },
      data: { statusId: 2 },
    });
    expect(res.status()).not.toBe(403);
  });

  test("does not block a bearer/no-cookie cross-origin request (CSRF-immune)", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/issues/1/status`, {
      headers: { origin: "https://evil.example", authorization: "Bearer mrt_whatever" },
      data: { statusId: 2 },
    });
    expect(res.status()).not.toBe(403);
  });

  test("does not block a cross-origin GET (only mutations are checked)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/issues`, {
      headers: { cookie: FAKE_SESSION, origin: "https://evil.example" },
    });
    expect(res.status()).not.toBe(403);
  });
});

test.describe("login rate limiting", () => {
  test("throttles /api/redmine/connect after 10 attempts from one IP", async ({ request }) => {
    const ip = "203.0.113.77";
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // Empty body fails validation, but the rate limiter runs first — that's
      // what we're exercising, and it keeps each attempt fast (no network).
      const res = await request.post(`${BASE_URL}/api/redmine/connect`, {
        headers: { "x-forwarded-for": ip },
        data: {},
      });
      statuses.push(res.status());
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
