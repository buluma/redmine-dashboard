import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// prisma/schema.prisma is the Postgres schema used to build the
// docker-compose.postgres.yml image (PRISMA_SCHEMA build arg). Nothing in
// CI ever runs `prisma generate`/`validate` against it — CI only exercises
// schema.dev.sqlite.prisma — so a broken datasource provider or an
// unsupported native type here can sit undetected until someone actually
// tries to migrate to Postgres.
describe("prisma/schema.prisma (postgres)", () => {
  it("validates against a postgresql:// datasource", () => {
    const schemaPath = path.resolve(__dirname, "../../../prisma/schema.prisma");

    expect(() =>
      execFileSync("npx", ["prisma", "validate", `--schema=${schemaPath}`], {
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        },
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
