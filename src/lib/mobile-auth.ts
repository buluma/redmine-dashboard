import crypto from "node:crypto";
import { prisma } from "@/src/lib/db";

const MOBILE_BEARER_PREFIX = "Bearer ";
const LAST_USED_TOUCH_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken(): string {
  return `mrt_${crypto.randomBytes(32).toString("base64url")}`;
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith(MOBILE_BEARER_PREFIX)) {
    return null;
  }
  const token = authHeader.slice(MOBILE_BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

export async function createMobileToken(userId: string, name?: string): Promise<{
  token: string;
  tokenRecordId: string;
  tokenPrefix: string;
  expiresAt: string | null;
}> {
  const token = randomToken();
  const tokenPrefix = token.slice(0, 12);
  const record = await prisma.mobileApiToken.create({
    data: {
      userId,
      name: name?.trim() || null,
      tokenHash: hashToken(token),
      tokenPrefix,
      lastUsedAt: new Date(),
      expiresAt: null,
      revokedAt: null,
    },
  });

  return {
    token,
    tokenRecordId: record.id,
    tokenPrefix: record.tokenPrefix,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
  };
}

export async function verifyMobileToken(authHeader: string | null): Promise<{
  tokenRecordId: string;
  userId: string;
} | null> {
  const token = parseBearerToken(authHeader);
  if (!token) {
    return null;
  }

  const now = new Date();
  const tokenRecord = await prisma.mobileApiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });
  if (!tokenRecord) {
    return null;
  }
  if (tokenRecord.revokedAt) {
    return null;
  }
  if (tokenRecord.expiresAt && tokenRecord.expiresAt.getTime() <= now.getTime()) {
    return null;
  }

  const shouldTouch =
    !tokenRecord.lastUsedAt || now.getTime() - tokenRecord.lastUsedAt.getTime() >= LAST_USED_TOUCH_MS;
  if (shouldTouch) {
    await prisma.mobileApiToken.update({
      where: { id: tokenRecord.id },
      data: { lastUsedAt: now },
    });
  }

  return {
    tokenRecordId: tokenRecord.id,
    userId: tokenRecord.userId,
  };
}

export async function revokeMobileToken(tokenRecordId: string): Promise<void> {
  await prisma.mobileApiToken.update({
    where: { id: tokenRecordId },
    data: { revokedAt: new Date() },
  });
}
