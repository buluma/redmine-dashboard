/**
 * Shared PrismaClient factory for the standalone Node scripts.
 *
 * Prisma 7 no longer reads the datasource URL from the schema or loads .env
 * on its own, so every client needs an explicit driver adapter. The adapter
 * is picked from DATABASE_URL the same way src/lib/db.ts does it.
 */
require("dotenv").config({ quiet: true });

const { PrismaClient } = require("@prisma/client");

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  if (url.startsWith("file:") || url.startsWith("sqlite:")) {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    // The adapter only strips a `file:` prefix, so normalize `sqlite:` URLs.
    const sqliteUrl = url.startsWith("sqlite:") ? `file:${url.slice("sqlite:".length)}` : url;
    return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: sqliteUrl }) });
  }

  const { PrismaPg } = require("@prisma/adapter-pg");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

module.exports = { createPrismaClient };
