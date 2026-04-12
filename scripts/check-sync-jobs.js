require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const jobs = await p.syncJob.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  jobs.forEach(j => {
    console.log(`ID: ${j.id.substring(0, 16)}...`);
    console.log(`  Type: ${j.jobType} | Status: ${j.status}`);
    console.log(`  Started: ${j.startedAt}`);
    console.log(`  Ended: ${j.endedAt}`);
    console.log(`  Error: ${(j.error || "").substring(0, 150)}`);
    console.log("---");
  });
  await p.$disconnect();
})();
