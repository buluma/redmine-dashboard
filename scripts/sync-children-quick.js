#!/usr/bin/env node
/**
 * Quick sync: Update childrenJson on parent issues from Redmine API.
 * Usage: node scripts/sync-children-quick.js [issue_id1] [issue_id2] ...
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

async function main() {
  const issueIds = process.argv.slice(2).map(Number).filter(Boolean);
  if (issueIds.length === 0) {
    console.log("Usage: node scripts/sync-children-quick.js <issue_id1> [issue_id2] ...");
    process.exit(1);
  }

  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true },
    select: { userId: true, baseUrl: true },
  });
  if (!cred) { console.error("No credential found"); process.exit(1); }

  console.log(`Syncing children for ${issueIds.length} issue(s)...\n`);

  for (const issueId of issueIds) {
    try {
      const res = await fetch(`${REDMINE_BASE_URL}/issues/${issueId}.json?key=${REDMINE_API_KEY}&include=children`);
      if (!res.ok) { console.error(`  ❌ #${issueId}: HTTP ${res.status}`); continue; }
      const data = await res.json();
      const children = data.issue?.children || [];
      console.log(`  #${issueId}: ${children.length} children`);

      // Only update the childrenJson field
      await prisma.issue.updateMany({
        where: {
          userId: cred.userId,
          redmineBaseUrl: cred.baseUrl.replace(/\/+$/, ""),
          redmineIssueId: issueId,
        },
        data: { childrenJson: children },
      });

      // Also upsert each direct child with parentIssueId
      for (const child of children) {
        await prisma.issue.upsert({
          where: {
            userId_redmineBaseUrl_redmineIssueId: {
              userId: cred.userId,
              redmineBaseUrl: cred.baseUrl.replace(/\/+$/, ""),
              redmineIssueId: child.id,
            },
          },
          update: {
            subject: child.subject,
            tracker: child.tracker?.name ?? null,
            parentIssueId: issueId,
          },
          create: {
            userId: cred.userId,
            redmineIssueId: child.id,
            redmineBaseUrl: cred.baseUrl.replace(/\/+$/, ""),
            subject: child.subject,
            tracker: child.tracker?.name ?? null,
            statusId: 0,
            statusName: "Unknown",
            parentIssueId: issueId,
            updatedOnRemote: new Date(),
          },
        });
      }
    } catch (err) {
      console.error(`  ❌ #${issueId}: ${err.message.substring(0, 100)}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

main().catch((err) => { console.error(err.message); process.exit(1); });
