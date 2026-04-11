#!/usr/bin/env node
/**
 * Sync Redmine users from issues into the local database.
 * Extracts users from author, assigned_to, journals, and time entries.
 */

require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

async function fetchUsersFromIssues() {
  console.log("🔍 Fetching users from Redmine issues...");
  const users = new Map();
  let offset = 0;
  let total = 0;
  const limit = 1000; // Fetch in larger batches

  while (true) {
    const res = await fetch(
      `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${limit}&offset=${offset}&include=author,assigned_to`
    );
    if (!res.ok) {
      console.error(`❌ Failed to fetch issues: ${res.status}`);
      break;
    }
    const data = await res.json();
    const issues = data.issues || [];
    if (issues.length === 0) break;

    total = data.total_count || 0;
    offset += limit;

    for (const issue of issues) {
      // Author
      if (issue.author?.id) {
        users.set(issue.author.id, {
          id: issue.author.id,
          name: issue.author.name || "",
          login: issue.author.login || null,
        });
      }
      // Assigned to
      if (issue.assigned_to?.id) {
        users.set(issue.assigned_to.id, {
          id: issue.assigned_to.id,
          name: issue.assigned_to.name || "",
          login: issue.assigned_to.login || null,
        });
      }
    }

    console.log(`   Fetched ${offset}/${total} issues, found ${users.size} unique users...`);
    if (offset >= total) break;
  }

  return Array.from(users.values());
}

async function syncUsers() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    console.error("❌ Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
    process.exit(1);
  }

  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}\n`);

  const remoteUsers = await fetchUsersFromIssues();
  console.log(`\n✅ Found ${remoteUsers.length} unique users\n`);

  let created = 0;
  let updated = 0;

  for (const user of remoteUsers) {
    try {
      const existing = await prisma.redmineUser.findUnique({ where: { id: user.id } });
      if (existing) {
        await prisma.redmineUser.update({
          where: { id: user.id },
          data: { name: user.name, lastSeenAt: new Date() },
        });
        updated++;
      } else {
        await prisma.redmineUser.create({
          data: {
            id: user.id,
            name: user.name,
            login: user.login,
          },
        });
        created++;
      }
    } catch (err) {
      console.error(`   ⚠️  Failed to upsert user #${user.id} (${user.name}): ${err.message}`);
    }
  }

  console.log(`📊 Results:`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Total:   ${remoteUsers.length}`);

  // List all users
  const allUsers = await prisma.redmineUser.findMany({
    orderBy: { name: "asc" },
  });

  console.log(`\n👥 All users in database (${allUsers.length}):`);
  console.log("   " + "─".repeat(40));
  for (const u of allUsers) {
    console.log(`   #${String(u.id).padEnd(4)} ${u.name}`);
  }
  console.log("   " + "─".repeat(40));

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

syncUsers().catch((err) => {
  console.error(`💥 Fatal error: ${err.message}`);
  process.exit(1);
});
