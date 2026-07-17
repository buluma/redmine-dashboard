import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "rd_session";

const PUBLIC_PREFIXES = ["/login", "/api/", "/_next/", "/icons/", "/scripts/", "/monitoring"];
const PUBLIC_FILES = ["/favicon.ico", "/manifest.json", "/sw.js"];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense for cookie-authenticated API mutations. Session cookies are
 * httpOnly + sameSite=strict, so a cross-site forgery cannot carry them — this
 * is the explicit second layer. Only mutating requests presenting the session
 * cookie are checked; bearer-token / API-key callers (mobile app, external
 * integrations) have no session cookie and are inherently CSRF-immune, and
 * anonymous requests (e.g. login) have nothing to forge against.
 */
function isCsrfBlocked(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) {
    return false;
  }
  if (!request.cookies.has(SESSION_COOKIE)) {
    return false;
  }

  const host = request.headers.get("host");
  if (!host) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host !== host;
    } catch {
      return true; // Malformed Origin — treat as hostile.
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host !== host;
    } catch {
      return true;
    }
  }

  // A browser making a state-changing request always sends Origin (or Referer);
  // their absence means this isn't a browser CSRF vector, so allow it.
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guard mutating API requests before the /api/ public passthrough below.
  if (pathname.startsWith("/api/") && isCsrfBlocked(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  if (
    PUBLIC_FILES.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Token format: userId.exp.sig — check expiry without needing the secret
  const parts = token.split(".");
  if (parts.length < 3) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
