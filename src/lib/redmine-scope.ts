import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import {
  OFFLINE_ACCOUNT_HEADER,
  OFFLINE_REDMINE_BASE_URL_HEADER,
  OFFLINE_SCOPE_MISMATCH_HEADER,
} from "@/src/lib/offline-scope-headers";

export function canonicalRedmineBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function redmineCatalogScope(userId: string, baseUrl: string): string {
  return JSON.stringify([userId, canonicalRedmineBaseUrl(baseUrl)]);
}

export async function getRedmineCatalogScopeForUser(userId: string): Promise<string | null> {
  const credential = await prisma.userRedmineCredential.findUnique({
    where: { userId },
    select: { baseUrl: true, isActive: true },
  });
  if (!credential?.isActive) return null;
  return redmineCatalogScope(userId, credential.baseUrl);
}

export function offlineActionScopeError(
  request: Request,
  userId: string,
  redmineBaseUrl: string | null,
): Response | null {
  const queuedAccountId = request.headers.get(OFFLINE_ACCOUNT_HEADER);
  const queuedBaseUrl = request.headers.get(OFFLINE_REDMINE_BASE_URL_HEADER);
  if (queuedAccountId === null && queuedBaseUrl === null) return null;

  let matches = queuedAccountId === userId && Boolean(queuedBaseUrl && redmineBaseUrl);
  if (matches && queuedBaseUrl) {
    try {
      matches = canonicalRedmineBaseUrl(queuedBaseUrl) === canonicalRedmineBaseUrl(redmineBaseUrl!);
    } catch {
      matches = false;
    }
  }
  if (matches) return null;

  return jsonError(
    "Queued action belongs to a different Redmine account or server.",
    409,
    { [OFFLINE_SCOPE_MISMATCH_HEADER]: "true" },
  );
}
