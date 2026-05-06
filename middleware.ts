import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "rd_session";

const PUBLIC_PREFIXES = ["/login", "/api/", "/_next/", "/icons/", "/monitoring"];
const PUBLIC_FILES = ["/favicon.ico", "/manifest.json", "/sw.js"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
