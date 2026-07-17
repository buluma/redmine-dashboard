import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(opts: {
  method?: string;
  cookie?: string;
  origin?: string;
  referer?: string;
  host?: string;
}): NextRequest {
  const headers = new Headers();
  headers.set("host", opts.host ?? "dash.example.com");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  if (opts.origin) headers.set("origin", opts.origin);
  if (opts.referer) headers.set("referer", opts.referer);
  return new NextRequest("https://dash.example.com/api/issues/1/status", {
    method: opts.method ?? "POST",
    headers,
  });
}

describe("CSRF middleware", () => {
  it("allows GET regardless of origin", () => {
    const res = middleware(req({ method: "GET", cookie: "rd_session=abc", origin: "https://evil.com" }));
    expect(res.status).toBe(200);
  });

  it("blocks a cookie-auth mutation from a cross-origin page", () => {
    const res = middleware(req({ method: "POST", cookie: "rd_session=abc", origin: "https://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("allows a same-origin cookie-auth mutation", () => {
    const res = middleware(req({ method: "POST", cookie: "rd_session=abc", origin: "https://dash.example.com" }));
    expect(res.status).toBe(200);
  });

  it("skips the check for bearer/api-key requests (no session cookie)", () => {
    // Mobile/external clients set no session cookie and cannot be CSRF'd.
    const res = middleware(req({ method: "POST", origin: "https://evil.com" }));
    expect(res.status).toBe(200);
  });

  it("allows a mutation with no Origin/Referer (non-browser context)", () => {
    const res = middleware(req({ method: "POST", cookie: "rd_session=abc" }));
    expect(res.status).toBe(200);
  });

  it("blocks a cross-origin referer when Origin is absent", () => {
    const res = middleware(req({ method: "POST", cookie: "rd_session=abc", referer: "https://evil.com/x" }));
    expect(res.status).toBe(403);
  });

  it("treats a malformed Origin as hostile", () => {
    const res = middleware(req({ method: "POST", cookie: "rd_session=abc", origin: "not a url" }));
    expect(res.status).toBe(403);
  });
});
