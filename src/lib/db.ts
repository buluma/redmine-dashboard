import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? new PrismaClient();

async function ensureRuntimeTables(): Promise<void> {
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
}

void ensureRuntimeTables().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db] runtime compatibility bootstrap failed: ${message}`);
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
