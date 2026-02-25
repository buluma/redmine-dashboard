import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/src/lib/env";

const SESSION_COOKIE = "rd_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}
