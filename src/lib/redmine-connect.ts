import { prisma } from "@/src/lib/db";
import { encryptText } from "@/src/lib/crypto";
import { env } from "@/src/lib/env";
import { RedmineClient } from "@/src/lib/redmine";

function displayName(firstname: string, lastname: string, fallback: string): string {
  const name = `${firstname} ${lastname}`.trim();
  return name || fallback;
}

export async function connectRedmineAccount(baseUrl: string, apiKey: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  if (env.redmineAllowedBaseUrls.length > 0) {
    const allowed = env.redmineAllowedBaseUrls.map((item) => item.replace(/\/$/, ""));
    if (!allowed.includes(normalizedBaseUrl)) {
      throw new Error("Redmine base URL is not allowed in this environment");
    }
  }
  const client = new RedmineClient(normalizedBaseUrl, apiKey);
  const currentUser = await client.getCurrentUser();

  const user = await prisma.user.upsert({
    where: { emailOrUsername: currentUser.login },
    update: {
      displayName: displayName(currentUser.firstname, currentUser.lastname, currentUser.login),
    },
    create: {
      emailOrUsername: currentUser.login,
      displayName: displayName(currentUser.firstname, currentUser.lastname, currentUser.login),
    },
  });

  const encrypted = encryptText(apiKey);

  await prisma.userRedmineCredential.upsert({
    where: { userId: user.id },
    update: {
      baseUrl: normalizedBaseUrl,
      apiKeyEncrypted: encrypted.encrypted,
      apiKeyIv: encrypted.iv,
      isActive: true,
      lastValidatedAt: new Date(),
    },
    create: {
      userId: user.id,
      baseUrl: normalizedBaseUrl,
      apiKeyEncrypted: encrypted.encrypted,
      apiKeyIv: encrypted.iv,
      isActive: true,
      lastValidatedAt: new Date(),
    },
  });

  await prisma.syncState.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  return user;
}
