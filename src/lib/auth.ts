import { decryptText } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/db";
import { RedmineClient } from "@/src/lib/redmine";
import { getSessionUserId } from "@/src/lib/session";

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

export async function getAuthenticatedUserId(): Promise<string | null> {
  return getSessionUserId();
}

export async function requireCurrentUser() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
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
