import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Client generation does not connect to a database. The fallback keeps
    // postinstall generation working in environments without local secrets.
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
