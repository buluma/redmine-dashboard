#!/usr/bin/env node
/**
 * Compare time entries between Redmine API and local Supabase database.
 * Shows discrepancies so you can verify data integrity.
 *
 * Usage: node scripts/sync-time-entries.js [issue_id]
 * Example: node scripts/sync-time-entries.js 113112
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

const issueId = parseInt(process.argv[2], 10);
if (isNaN(issueId)) {
  console.error("Usage: node scripts/sync-time-entries.js [issue_id]");
  console.error("Example: node scripts/sync-time-entries.js 113112");
  process.exit(1);
}

async function fetchFromRedmine() {
  const url = `${REDMINE_BASE_URL}/time_entries.json?issue_id=${issueId}&key=${REDMINE_API_KEY}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Redmine API returned ${res.status}`);
  }
  const data = await res.json();
  return (data.time_entries || []).map(e => ({
    id: e.id,
    hours: e.hours,
    activity: e.activity?.name ?? "-",
    user: e.user?.name ?? "-",
    comments: e.comments ?? "-",
    spentOn: e.spent_on,
    createdOn: e.created_on,
  }));
}

async function fetchFromLocal() {
  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true }, select: { userId: true },
  });
  if (!cred) throw new Error("No active Redmine credential found");

  const issue = await prisma.issue.findFirst({
    where: { userId: cred.userId, redmineIssueId: issueId },
    select: { id: true },
  });
  if (!issue) return [];

  const entries = await prisma.timeEntry.findMany({
    where: { issueId: issue.id },
    orderBy: { spentOn: "desc" },
  });

  return entries.map(e => ({
    id: e.redmineTimeEntryId,
    hours: e.hours,
    activity: e.activityName ?? "-",
    user: e.authorName ?? "-",
    comments: e.comments ?? "-",
    spentOn: e.spentOn.toISOString().slice(0, 10),
    createdOn: e.createdAt.toISOString(),
  }));
}

function formatEntry(e, idx) {
  const num = String(idx + 1).padStart(2, " ");
  const hrs = String(e.hours).padStart(6, " ");
  return `  ${num}. #${e.id} | ${hrs}h | ${e.activity.padEnd(22)} | ${e.spentOn} | ${e.comments.substring(0, 50)}`;
}

async function main() {
  console.log(`⏱️  Comparing time entries for issue #${issueId}`);
  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}\n`);

  const redmine = await fetchFromRedmine();
  const local = await fetchFromLocal();

  console.log(`📊 Redmine API: ${redmine.length} entries`);
  console.log(`📊 Local DB:   ${local.length} entries\n`);

  // Build sets by Redmine time entry ID
  const redmineMap = new Map(redmine.map(e => [e.id, e]));
  const localMap = new Map(local.map(e => [e.id, e]));

  const missingInLocal = [...redmineMap.keys()].filter(id => !localMap.has(id));
  const missingInRedmine = [...localMap.keys()].filter(id => !redmineMap.has(id));

  // Check for differences in matching entries
  const mismatches = [];
  for (const [id, r] of redmineMap) {
    const l = localMap.get(id);
    if (!l) continue;
    const diffs = [];
    if (Math.abs(r.hours - l.hours) > 0.001) diffs.push(`hours: ${r.hours} vs ${l.hours}`);
    if (r.activity !== l.activity) diffs.push(`activity: "${r.activity}" vs "${l.activity}"`);
    if (r.spentOn !== l.spentOn) diffs.push(`spentOn: ${r.spentOn} vs ${l.spentOn}`);
    if (r.comments !== l.comments) diffs.push(`comments differ`);
    if (diffs.length > 0) {
      mismatches.push({ id, redmine: r, local: l, diffs });
    }
  }

  if (redmine.length > 0) {
    console.log("── Redmine entries ──");
    redmine.forEach((e, i) => console.log(formatEntry(e, i)));
  }

  if (local.length > 0) {
    console.log("\n── Local entries ──");
    local.forEach((e, i) => console.log(formatEntry(e, i)));
  }

  console.log("\n── Discrepancies ──");
  if (missingInLocal.length === 0 && missingInRedmine.length === 0 && mismatches.length === 0) {
    console.log("  ✅ Perfect match!");
  } else {
    if (missingInLocal.length > 0) {
      console.log(`  ⚠️  ${missingInLocal.length} entry(s) in Redmine but missing locally:`);
      missingInLocal.forEach(id => {
        const e = redmineMap.get(id);
        console.log(`     #${e.id} - ${e.hours}h on ${e.spentOn} (${e.comments.substring(0, 40)})`);
      });
    }
    if (missingInRedmine.length > 0) {
      console.log(`  ⚠️  ${missingInRedmine.length} entry(s) locally but not in Redmine:`);
      missingInRedmine.forEach(id => {
        const e = localMap.get(id);
        console.log(`     #${e.id} - ${e.hours}h on ${e.spentOn}`);
      });
    }
    if (mismatches.length > 0) {
      console.log(`  ⚠️  ${mismatches.length} entry(s) with data differences:`);
      mismatches.forEach(m => {
        console.log(`     #${m.id}: ${m.diffs.join(", ")}`);
      });
    }
  }

  const redmineTotal = redmine.reduce((s, e) => s + e.hours, 0);
  const localTotal = local.reduce((s, e) => s + e.hours, 0);
  console.log(`\n── Totals ──`);
  console.log(`  Redmine: ${redmineTotal.toFixed(2)}h`);
  console.log(`  Local:   ${localTotal.toFixed(2)}h`);
  if (Math.abs(redmineTotal - localTotal) < 0.01) {
    console.log("  ✅ Totals match!");
  } else {
    console.log(`  ⚠️  Difference: ${(redmineTotal - localTotal).toFixed(2)}h`);
  }

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
