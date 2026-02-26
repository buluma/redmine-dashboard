import { decryptText } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/db";
import { logEvent } from "@/src/lib/log";
import { verifyMobileToken } from "@/src/lib/mobile-auth";
import { RedmineClient } from "@/src/lib/redmine";
import { getSessionUserId } from "@/src/lib/session";

export async function requireCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
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
