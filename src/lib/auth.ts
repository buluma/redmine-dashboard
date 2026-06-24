import { decryptText } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/db";
import { logEvent } from "@/src/lib/log";
import { verifyMobileToken } from "@/src/lib/mobile-auth";
import { RedmineClient } from "@/src/lib/redmine";
import { getSessionUserId, requireCsrf } from "@/src/lib/session";
import { headers } from "next/headers";

/**
 * HTTP methods that require CSRF protection (mutating operations)
 */
export const CSRF_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * Get current request method from headers (for CSRF check)
 */
export function isMutatingRequest(method: string | null): boolean {
  return method ? CSRF_PROTECTED_METHODS.includes(method.toUpperCase()) : false;
}

export async function requireCurrentUser(validateCsrf = false) {
  const sessionUserId = await getSessionUserId();

  if (sessionUserId) {
    if (validateCsrf) {
      await requireCsrf();
    }
    const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
    if (!user) {
      throw new Error("Unauthorized");
    }
    return user;
  }

  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  const verified = authHeader ? await verifyMobileToken(authHeader) : null;
  if (!verified) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({ where: { id: verified.userId } });
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireRedmineClient() {
  const user = await requireCurrentUser();
  const { cred, client } = await requireRedmineClientForUser(user.id);

  return { user, cred, client };
}

export async function requireRedmineClientForUser(userId: string) {
  const cred = await prisma.userRedmineCredential.findUnique({ where: { userId } });
  if (!cred || !cred.isActive) {
    throw new Error("Redmine account not connected");
  }

  const apiKey = decryptText(cred.apiKeyEncrypted, cred.apiKeyIv);
  const client = new RedmineClient(cred.baseUrl, apiKey);

  return { cred, client };
}

export async function requireMobileUser(request: Request): Promise<{
  user: {
    id: string;
    emailOrUsername: string;
    displayName: string;
  };
  tokenRecordId: string;
}> {
  const verified = await verifyMobileToken(request.headers.get("authorization"));
  if (!verified) {
    logEvent("mobile.auth.failed", { reason: "invalid_or_missing_token" }, "warn");
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: {
      id: true,
      emailOrUsername: true,
      displayName: true,
    },
  });

  if (!user) {
    logEvent("mobile.auth.failed", { reason: "user_not_found", userId: verified.userId }, "warn");
    throw new Error("Unauthorized");
  }

  return { user, tokenRecordId: verified.tokenRecordId };
}
