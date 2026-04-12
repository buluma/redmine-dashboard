require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const issueId = parseInt(process.argv[2] || "101201", 10);
  const issue = await p.issue.findFirst({ where: { redmineIssueId: issueId }, select: { redmineIssueId: true, subject: true, childrenJson: true } });
  if (!issue) { console.log(`Issue #${issueId} not found`); await p.$disconnect(); return; }
  console.log(`Issue #${issue.redmineIssueId}: ${issue.subject?.substring(0, 80)}`);
  const children = issue.childrenJson;
  if (!Array.isArray(children) || children.length === 0) { console.log("No children stored"); await p.$disconnect(); return; }
  console.log(`Children: ${children.length}`);
  console.log(JSON.stringify(children[0], null, 2));
  console.log("---");
  console.log(JSON.stringify(children[Math.min(2, children.length - 1)], null, 2));
  await p.$disconnect();
})();
