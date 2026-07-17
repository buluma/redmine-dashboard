import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function req(opts: {
  method?: string;
  cookie?: string;
  origin?: string;
  referer?: string;
  host?: string;
  path?: string;
}): NextRequest {
  const headers = new Headers();
  headers.set("host", opts.host ?? "dash.example.com");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.referer) headers.set("referer", opts.referer);
  return new NextRequest(`https://dash.example.com${opts.path ?? "/api/issues/1/status"}`, {
    method: opts.method ?? "POST",
    headers,
  });
}

// Valid unexpired session token so the proxy's page-auth branch doesn't redirect
// GET requests it lets through. Format: userId.exp.sig.
const VALID_TOKEN = `rd_session=u1.${Math.floor(Date.now() / 1000) + 3600}.sig`;

describe("proxy CSRF guard for /api mutations", () => {
  it("allows a GET API request regardless of origin", () => {
    const res = proxy(req({ method: "GET", cookie: VALID_TOKEN, origin: "https://evil.com" }));
    expect(res.status).toBe(200);
  });

  it("blocks a cookie-auth API mutation from a cross-origin page", () => {
    const res = proxy(req({ method: "POST", cookie: VALID_TOKEN, origin: "https://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("allows a same-origin cookie-auth API mutation", () => {
    const res = proxy(req({ method: "POST", cookie: VALID_TOKEN, origin: "https://dash.example.com" }));
    expect(res.status).toBe(200);
  });

  it("skips the check for bearer/api-key requests (no session cookie)", () => {
    const res = proxy(req({ method: "POST", origin: "https://evil.com" }));
    expect(res.status).toBe(200);
  });

  it("allows an API mutation with no Origin/Referer (non-browser context)", () => {
    const res = proxy(req({ method: "POST", cookie: VALID_TOKEN }));
    expect(res.status).toBe(200);
  });

  it("blocks a cross-origin referer when Origin is absent", () => {
    const res = proxy(req({ method: "POST", cookie: VALID_TOKEN, referer: "https://evil.com/x" }));
    expect(res.status).toBe(403);
  });

  it("treats a malformed Origin as hostile", () => {
    const res = proxy(req({ method: "POST", cookie: VALID_TOKEN, origin: "not a url" }));
    expect(res.status).toBe(403);
  });
});
