#!/usr/bin/env node
/**
 * Sync children data for specific issues to Supabase.
 * Usage: node scripts/sync-issue-children.js [issue_id1] [issue_id2] ...
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

async function fetchIssueWithChildren(issueId) {
  const res = await fetch(
    `${REDMINE_BASE_URL}/issues/${issueId}.json?key=${REDMINE_API_KEY}&include=children`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch issue #${issueId}: ${res.status}`);
  }
  const data = await res.json();
  return data.issue;
}

function flattenChildren(children, depth = 0) {
  const result = [];
  for (const child of children) {
    result.push({
      id: child.id,
      tracker: child.tracker?.name ?? null,
      subject: child.subject ?? "",
      _depth: depth,
    });
    if (child.children && child.children.length > 0) {
      result.push(...flattenChildren(child.children, depth + 1));
    }
  }
  return result;
}

async function main() {
  const issueIds = process.argv.slice(2).map(Number).filter(Boolean);
  if (issueIds.length === 0) {
    console.log("Usage: node scripts/sync-issue-children.js <issue_id1> [issue_id2] ...");
    process.exit(1);
  }

  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}`);
  console.log(`📊 Syncing children for ${issueIds.length} issue(s)\n`);

  for (const issueId of issueIds) {
    try {
      console.log(`📥 Fetching #${issueId}...`);
      const issue = await fetchIssueWithChildren(issueId);
      const children = issue.children || [];
      const flatChildren = flattenChildren(children);

      console.log(`   Found ${children.length} direct children (${flatChildren.length} total with nesting)`);

      // Find or create the user credential
      let user = await prisma.userRedmineCredential.findFirst({
        where: { isActive: true },
        select: { userId: true, baseUrl: true },
      });

      if (!user) {
        console.error("   ❌ No active Redmine credential found");
        continue;
      }

      const baseUrl = user.baseUrl.replace(/\/+$/, "");

      // Upsert the parent issue first if not exists
      await prisma.issue.upsert({
        where: {
          userId_redmineBaseUrl_redmineIssueId: {
            userId: user.userId,
            redmineBaseUrl: baseUrl,
            redmineIssueId: issueId,
          },
        },
        update: {
          childrenJson: children,
          subject: issue.subject ?? `Issue #${issueId}`,
          tracker: issue.tracker?.name ?? null,
          statusId: issue.status?.id ?? 0,
          statusName: issue.status?.name ?? "Unknown",
          updatedOnRemote: issue.updated_on ? new Date(issue.updated_on) : new Date(),
        },
        create: {
          userId: user.userId,
          redmineIssueId: issueId,
          redmineBaseUrl: baseUrl,
          subject: issue.subject ?? `Issue #${issueId}`,
          tracker: issue.tracker?.name ?? null,
          statusId: issue.status?.id ?? 0,
          statusName: issue.status?.name ?? "Unknown",
          updatedOnRemote: issue.updated_on ? new Date(issue.updated_on) : new Date(),
          childrenJson: children,
        },
      });

      // Upsert each child issue
      let synced = 0;
      for (const child of flatChildren) {
        await prisma.issue.upsert({
          where: {
            userId_redmineBaseUrl_redmineIssueId: {
              userId: user.userId,
              redmineBaseUrl: baseUrl,
              redmineIssueId: child.id,
            },
          },
          update: {
            subject: child.subject,
            tracker: child.tracker,
            parentIssueId: issueId,
          },
          create: {
            userId: user.userId,
            redmineIssueId: child.id,
            redmineBaseUrl: baseUrl,
            subject: child.subject,
            tracker: child.tracker,
            statusId: 0,
            statusName: "Unknown",
            parentIssueId: issueId,
            updatedOnRemote: new Date(),
          },
        });
        synced++;
      }

      console.log(`   ✅ Synced ${synced} child issue(s) to Supabase`);
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

main().catch((err) => {
  console.error(`💥 Fatal error: ${err.message}`);
  process.exit(1);
});
