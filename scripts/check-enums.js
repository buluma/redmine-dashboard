require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const priorities = await p.redmineEnumeration.findMany({
    where: { kind: "issue_priority" },
    orderBy: { position: "asc" },
  });
  console.log(`Priorities: ${priorities.length}`);
  priorities.forEach(pr => console.log(`  #${pr.id}: ${pr.name}${pr.isDefault ? " ⭐" : ""}`));

  const activities = await p.redmineEnumeration.count({
    where: { kind: "time_entry_activity" },
  });
  console.log(`Activities: ${activities}`);

  await p.$disconnect();
})();
