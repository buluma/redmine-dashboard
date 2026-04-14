import { PrismaClient } from "@prisma/client";
import { env } from "@/src/lib/env";

declare global {
  var prisma: PrismaClient | undefined;
}

function buildPrismaUrl(rawUrl: string): string {
  // Keep pool timeout explicit; connection_limit can be overridden via env in deployments when needed.
  if (!rawUrl.startsWith("postgres://") && !rawUrl.startsWith("postgresql://")) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    const envConnectionLimit = process.env.PRISMA_CONNECTION_LIMIT;
    if (envConnectionLimit && !url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", envConnectionLimit);
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

const prismaUrl = buildPrismaUrl(env.databaseUrl);
const prismaClient =
  prismaUrl === env.databaseUrl
    ? new PrismaClient()
    : new PrismaClient({
        datasources: {
          db: { url: prismaUrl },
        },
      });

export const prisma = global.prisma ?? prismaClient;

async function executeRawIgnoreDuplicate(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("duplicate column name")) {
      return;
    }
    throw error;
  }
}

async function ensureRuntimeTables(): Promise<void> {
  const databaseUrl = env.databaseUrl.toLowerCase();
  const sqliteMode = databaseUrl.startsWith("file:") || databaseUrl.startsWith("sqlite:");
  if (!sqliteMode) {
    return;
  }

  // Keep older local SQLite files compatible when new models are added.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IssueGithubLink" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "issueId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "repositoryFullName" TEXT NOT NULL,
      "githubIssueNumber" INTEGER,
      "githubPrNumber" INTEGER,
      "url" TEXT NOT NULL,
      "title" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "IssueGithubLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "IssueGithubLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IssueGithubLink_issueId_url_key"
    ON "IssueGithubLink"("issueId", "url");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "IssueGithubLink_issueId_createdAt_idx"
    ON "IssueGithubLink"("issueId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "IssueGithubLink_userId_createdAt_idx"
    ON "IssueGithubLink"("userId", "createdAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MobileApiToken" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT,
      "tokenHash" TEXT NOT NULL,
      "tokenPrefix" TEXT NOT NULL,
      "lastUsedAt" DATETIME,
      "expiresAt" DATETIME,
      "revokedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "MobileApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "MobileApiToken_tokenHash_key"
    ON "MobileApiToken"("tokenHash");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MobileApiToken_userId_revokedAt_idx"
    ON "MobileApiToken"("userId", "revokedAt");
  `);
  await executeRawIgnoreDuplicate(`
    ALTER TABLE "Issue" ADD COLUMN "lastActivityAt" DATETIME;
  `);
  await executeRawIgnoreDuplicate(`
    ALTER TABLE "Issue" ADD COLUMN "lastActivityType" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Issue_userId_lastActivityAt_idx"
    ON "Issue"("userId", "lastActivityAt");
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "Issue"
    SET "lastActivityAt" = "updatedOnRemote",
        "lastActivityType" = COALESCE("lastActivityType", 'issue_update')
    WHERE "lastActivityAt" IS NULL;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IssueActivityEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "issueId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "sourceRemoteId" TEXT,
      "eventAt" DATETIME NOT NULL,
      "summary" TEXT,
      "dedupeKey" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IssueActivityEvent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IssueActivityEvent_dedupeKey_key"
    ON "IssueActivityEvent"("dedupeKey");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "IssueActivityEvent_issueId_eventAt_idx"
    ON "IssueActivityEvent"("issueId", "eventAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "IssueActivityEvent_issueId_eventType_idx"
    ON "IssueActivityEvent"("issueId", "eventType");
  `);
}

void ensureRuntimeTables().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db] runtime compatibility bootstrap failed: ${message}`);
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
