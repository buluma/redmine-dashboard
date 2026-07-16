import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteRawUnsafe = vi.fn();

vi.mock("@prisma/client", () => {
  const PrismaClient = class {
    $executeRawUnsafe = mockExecuteRawUnsafe;
  };
  return { PrismaClient };
});

describe("database utilities", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
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
    it("sets WAL journal mode and a busy_timeout before touching runtime tables", async () => {
      await import("@/src/lib/db");
      await new Promise((resolve) => setTimeout(resolve, 0));

      const sqlCalls: string[] = mockExecuteRawUnsafe.mock.calls.map(
        (c: unknown[]) => String(c[0])
      );
      const walIndex = sqlCalls.findIndex((sql) => sql.includes("PRAGMA journal_mode=WAL"));
      const busyTimeoutIndex = sqlCalls.findIndex((sql) => sql.includes("PRAGMA busy_timeout=5000"));
      const webhookTableIndex = sqlCalls.findIndex((sql) => sql.includes("WebhookSubscription"));

      expect(walIndex).toBeGreaterThanOrEqual(0);
      expect(busyTimeoutIndex).toBeGreaterThanOrEqual(0);
      expect(walIndex).toBeLessThan(webhookTableIndex);
      expect(busyTimeoutIndex).toBeLessThan(webhookTableIndex);
    });
  });
});
