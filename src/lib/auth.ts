import { decryptText } from "@/src/lib/crypto";
import { prisma } from "@/src/lib/db";
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
  const cred = await prisma.userRedmineCredential.findUnique({ where: { userId: user.id } });

  if (!cred || !cred.isActive) {
    throw new Error("Redmine account not connected");
  }

  const apiKey = decryptText(cred.apiKeyEncrypted, cred.apiKeyIv);
  const client = new RedmineClient(cred.baseUrl, apiKey);

  return { user, cred, client };
}
