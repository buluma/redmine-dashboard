import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "@/src/lib/env";

const SESSION_COOKIE = "rd_session";
const CSRF_COOKIE = "rd_csrf";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Generate a random CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Get current CSRF token from cookies, creating one if needed
 */
export async function getCsrfToken(): Promise<string> {
  const store = await cookies();
  let token = store.get(CSRF_COOKIE)?.value;
  
  if (!token) {
    token = generateCsrfToken();
    store.set(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }
  
  return token;
}

/**
 * Validate CSRF token from request headers
 * Accepts header names: X-CSRF-Token, X-XSRF-Token, or Origin check
 */
export async function validateCsrfToken(): Promise<boolean> {
  const store = await cookies();
  const headerStore = await headers();
  
  // Get stored CSRF token
  const storedToken = store.get(CSRF_COOKIE)?.value;
  if (!storedToken) {
    // No CSRF token set yet - allow first request
    return true;
  }
  
  // Check multiple header options for CSRF token
  const csrfToken = 
    headerStore.get("x-csrf-token") ||
    headerStore.get("x-xsrf-token") ||
    headerStore.get("x-csrf");
  
  if (csrfToken && csrfToken === storedToken) {
    return true;
  }
  
  // Also check Origin header for Same-Origin requests
  const origin = headerStore.get("origin");
  const referer = headerStore.get("referer");
  
  // If request is same-origin (our app), allow it
  if (origin && (origin === process.env.NEXT_PUBLIC_BASE_URL || origin === "http://localhost:3000" || origin === "http://localhost:3001")) {
    return true;
  }
  if (referer && (referer.includes("localhost:3000") || referer.includes("localhost:3001"))) {
    return true;
  }
  
  // No valid CSRF token found
  return false;
}

/**
 * Require CSRF validation - throws if invalid
 */
export async function requireCsrf(): Promise<void> {
  const valid = await validateCsrfToken();
  if (!valid) {
    throw new Error("CSRF validation failed");
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const [userId, expRaw, sig] = token.split(".");
  if (!userId || !expRaw || !sig) {
    return null;
  }
  const payload = `${userId}.${expRaw}`;
  if (sign(payload) !== sig) {
    return null;
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return userId;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "strict", // Changed from "lax" to "strict" for CSRF protection
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  
  // Also set CSRF token when session is created
  await getCsrfToken();
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}