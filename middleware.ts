import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Central CSRF defense for the API. Session cookies are httpOnly + sameSite=strict,
// so a cross-site forgery cannot carry them — this middleware is the explicit
// second layer, run at the edge before any route handler.
//
// It only guards *mutating* requests that are authenticated by the session
// cookie. Requests carrying a bearer token or an X-API-Key (mobile app,
// external integrations) have no session cookie and are inherently immune to
// CSRF — an attacker's page cannot set those headers cross-origin — so they
// pass through untouched. Anonymous requests (e.g. login before a session
// exists) also pass; they have nothing to forge against.

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SESSION_COOKIE = "rd_session";

function isCrossOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) {
    // Can't establish our own origin; don't block on missing infra header.
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

  // A browser making a state-changing request always sends Origin (or at least
  // Referer). Their total absence means this isn't a browser form-post CSRF
  // vector, so allow it — the session cookie itself is sameSite=strict.
  return false;
}

export function middleware(request: NextRequest): NextResponse {
  if (!MUTATING_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);
  if (!hasSessionCookie) {
    return NextResponse.next();
  }

  if (isCrossOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
