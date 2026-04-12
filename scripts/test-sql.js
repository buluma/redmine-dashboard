require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  try {
    const r = await p.$executeRawUnsafe("SELECT 1");
    console.log("Raw SQL works:", r);
  } catch (e) {
    console.error("Raw SQL error:", e.message);
  }
  await p.$disconnect();
})();
