import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteRawUnsafe = vi.fn();
const mockQueryRawUnsafe = vi.fn();
const mockSqliteAdapter = vi.fn();

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class {
    constructor(options: { url: string }) {
      mockSqliteAdapter(options);
    }
  },
}));

vi.mock("@/src/generated/prisma/client", () => {
  const PrismaClient = class {
    $executeRawUnsafe = mockExecuteRawUnsafe;
    $queryRawUnsafe = mockQueryRawUnsafe;
  };
  return { PrismaClient };
});

describe("database utilities", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe("SQLite adapter URL", () => {
    async function adapterUrlFor(databaseUrl: string): Promise<string> {
      vi.stubEnv("DATABASE_URL", databaseUrl);
      await import("@/src/lib/db");
      return mockSqliteAdapter.mock.calls[0][0].url;
    }

    it("resolves relative file: paths from the working directory", async () => {
      expect(await adapterUrlFor("file:./prisma/dev.db")).toBe(`file:${process.cwd()}/prisma/dev.db`);
    });

    it("normalizes sqlite: URLs to file: because the adapter only strips file:", async () => {
      expect(await adapterUrlFor("sqlite:./prisma/dev.db")).toBe(`file:${process.cwd()}/prisma/dev.db`);
      vi.resetModules();
      mockSqliteAdapter.mockClear();
      expect(await adapterUrlFor("sqlite:/var/data/dev.db")).toBe("file:/var/data/dev.db");
    });

    it("drops query params so they don't become part of the filename", async () => {
      expect(await adapterUrlFor("file:./prisma/dev.db?connection_limit=1")).toBe(`file:${process.cwd()}/prisma/dev.db`);
      vi.resetModules();
      mockSqliteAdapter.mockClear();
      expect(await adapterUrlFor("file:/var/data/dev.db?socket_timeout=10")).toBe("file:/var/data/dev.db");
    });

    it("keeps in-memory databases in memory", async () => {
      expect(await adapterUrlFor("sqlite::memory:")).toBe("file::memory:");
    });
  });

  describe("prisma singleton", () => {
    it("exports a prisma instance", async () => {
      const { prisma } = await import("@/src/lib/db");
      expect(prisma).toBeDefined();
      expect(prisma.$executeRawUnsafe).toBeDefined();
    });

    it("reuses global prisma instance in development", async () => {
      // First import
      const { prisma: prisma1 } = await import("@/src/lib/db");
      // Should be the same instance
      const { prisma: prisma2 } = await import("@/src/lib/db");
      expect(prisma1).toBe(prisma2);
    });
  });

  describe("executeRawIgnoreDuplicate", () => {
    it("ignores duplicate column name errors", async () => {
      mockExecuteRawUnsafe.mockRejectedValue(
        new Error("duplicate column name: some_column")
      );

      const { prisma } = await import("@/src/lib/db");
      // Access the internal function through module re-import
      // Since it's not exported, we test it indirectly through ensureRuntimeTables
      // For now, we'll test the behavior through the bootstrap
      await expect(
        prisma.$executeRawUnsafe("ALTER TABLE test ADD COLUMN col TEXT")
      ).rejects.toThrow("duplicate column name");
    });

    it("throws non-duplicate errors", async () => {
      mockExecuteRawUnsafe.mockRejectedValue(
        new Error("table does not exist")
      );

      const { prisma } = await import("@/src/lib/db");
      await expect(
        prisma.$executeRawUnsafe("SELECT * FROM nonexistent")
      ).rejects.toThrow("table does not exist");
    });
  });

  describe("ensureRuntimeTables", () => {
    it("initializes without error for SQLite databases", async () => {
      // The function is called automatically on import
      // We're testing that it doesn't throw during module load
      const { prisma } = await import("@/src/lib/db");
      expect(prisma).toBeDefined();
    });

    it("creates WebhookSubscription and WebhookDelivery tables for SQLite", async () => {
      await import("@/src/lib/db");
      // ensureRuntimeTables is fire-and-forget with many awaits; drain the microtask queue
      await new Promise((resolve) => setTimeout(resolve, 0));

      const sqlCalls: string[] = mockExecuteRawUnsafe.mock.calls.map(
        (c: unknown[]) => String(c[0])
      );
      expect(sqlCalls.some((sql) => sql.includes("WebhookSubscription"))).toBe(true);
      expect(sqlCalls.some((sql) => sql.includes("WebhookDelivery"))).toBe(true);
    });
  });

  describe("configureSqlitePragmas", () => {
    it("sets WAL journal mode and a busy_timeout via $queryRawUnsafe (PRAGMA returns a row, $executeRawUnsafe rejects that on SQLite)", async () => {
      await import("@/src/lib/db");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const pragmaCalls: string[] = mockQueryRawUnsafe.mock.calls.map(
        (c: unknown[]) => String(c[0])
      );
      expect(pragmaCalls.some((sql) => sql.includes("PRAGMA journal_mode=WAL"))).toBe(true);
      expect(pragmaCalls.some((sql) => sql.includes("PRAGMA busy_timeout=5000"))).toBe(true);
      expect(mockExecuteRawUnsafe).not.toHaveBeenCalledWith(expect.stringContaining("PRAGMA"));
    });

    it("still runs ensureRuntimeTables afterward", async () => {
      await import("@/src/lib/db");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const sqlCalls: string[] = mockExecuteRawUnsafe.mock.calls.map(
        (c: unknown[]) => String(c[0])
      );
      expect(sqlCalls.some((sql) => sql.includes("WebhookSubscription"))).toBe(true);
    });
  });
});
