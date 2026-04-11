require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const count = await p.redmineUser.count();
  const users = await p.redmineUser.findMany({ orderBy: { name: "asc" }, take: 20 });
  console.log(`Total users in DB: ${count}`);
  users.forEach(u => console.log(`  #${u.id}: ${u.name}`));
  await p.$disconnect();
})();
