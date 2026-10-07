require("dotenv").config({ path: ".env" });
const { createPrismaClient } = require("./lib/prisma-client");
const p = createPrismaClient();

(async () => {
  const c = await p.issue.count();
  console.log(`Issues in Supabase: ${c.toLocaleString()}`);
  const s = await p.issue.findFirst({ orderBy: { updatedAt: "desc" }, select: { redmineIssueId: true, subject: true, updatedAt: true } });
  console.log(`Latest: #${s?.redmineIssueId} - ${s?.subject?.substring(0, 60)} (${s?.updatedAt})`);
  await p.$disconnect();
})();
