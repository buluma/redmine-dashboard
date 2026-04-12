#!/usr/bin/env node
/**
 * Sync children + time entries for issues from saved queries.
 * Uses Supabase as the source of truth — only fetches what's missing.
 *
 * Usage: node scripts/sync-query-details.js <query_id1> <query_id2> ...
 * Example: node scripts/sync-query-details.js 754 755 749 743 744 747
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;

const queryIds = process.argv.slice(2).map(Number).filter(Boolean);
if (queryIds.length === 0) {
  console.error("Usage: node scripts/sync-query-details.js <query_id1> ...");
  process.exit(1);
}

async function fetchQueryIssueIds(queryId) {
  const ids = [];
  let offset = 0;
  while (true) {
    const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&query_id=${queryId}&status_id=*`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    for (const issue of data.issues || []) ids.push(issue.id);
    offset += data.issues?.length || 0;
    if (offset >= (data.total_count || 0)) break;
  }
  return ids;
}

async function syncChildren(issueId) {
  const url = `${REDMINE_BASE_URL}/issues/${issueId}.json?key=${REDMINE_API_KEY}&include=children`;
  const res = await fetch(url);
  if (!res.ok) return 0;
  const data = await res.json();
  const children = data.issue?.children || [];
  if (children.length === 0) return 0;

  await prisma.issue.updateMany({
    where: { redmineIssueId: issueId },
    data: { childrenJson: children },
  });
  return children.length;
}

async function syncTimeEntries(issueId) {
  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true }, select: { userId: true },
  });
  if (!cred) return { remote: 0, synced: 0 };

  const issue = await prisma.issue.findFirst({
    where: { userId: cred.userId, redmineIssueId: issueId },
    select: { id: true },
  });
  if (!issue) return { remote: 0, synced: 0 };

  const url = `${REDMINE_BASE_URL}/time_entries.json?issue_id=${issueId}&key=${REDMINE_API_KEY}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) return { remote: 0, synced: 0 };
  const data = await res.json();
  const entries = data.time_entries || [];
  if (entries.length === 0) return { remote: 0, synced: 0 };

  let synced = 0;
  for (const entry of entries) {
    await prisma.timeEntry.upsert({
      where: {
        issueId_redmineTimeEntryId: {
          issueId: issue.id,
          redmineTimeEntryId: entry.id,
        },
      },
      update: {
        hours: entry.hours,
        activityId: entry.activity?.id || 0,
        activityName: entry.activity?.name,
        authorName: entry.user?.name,
        comments: entry.comments,
        spentOn: new Date(entry.spent_on),
      },
      create: {
        issueId: issue.id,
        userId: cred.userId,
        redmineTimeEntryId: entry.id,
        hours: entry.hours,
        activityId: entry.activity?.id || 0,
        activityName: entry.activity?.name,
        authorName: entry.user?.name,
        comments: entry.comments,
        spentOn: new Date(entry.spent_on),
      },
    });
    synced++;
  }
  return { remote: entries.length, synced };
}

async function main() {
  console.log("🔍 Fetching issue IDs from queries...\n");

  const allIds = new Set();
  for (const qid of queryIds) {
    const ids = await fetchQueryIssueIds(qid);
    console.log(`  Query #${qid}: ${ids.length} issues`);
    for (const id of ids) allIds.add(id);
  }

  const issueIds = Array.from(allIds);
  console.log(`\n📋 Total unique issues: ${issueIds.length}\n`);

  let totalChildren = 0;
  let totalRemoteTE = 0;
  let totalSyncedTE = 0;

  // Process in parallel batches of 5 to avoid overwhelming Redmine API
  const CONCURRENCY = 5;
  for (let i = 0; i < issueIds.length; i += CONCURRENCY) {
    const batch = issueIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (id) => {
      const childCount = await syncChildren(id);
      const te = await syncTimeEntries(id);
      return { childCount, remoteTE: te.remote, syncedTE: te.synced };
    }));

    for (const r of results) {
      totalChildren += r.childCount;
      totalRemoteTE += r.remoteTE;
      totalSyncedTE += r.syncedTE;
    }

    const processed = Math.min(i + CONCURRENCY, issueIds.length);
    const pct = ((processed) / issueIds.length * 100).toFixed(0);
    process.stdout.write(`\r📦 Issue ${processed}/${issueIds.length} (${pct}%) | Children: ${totalChildren} | Time: ${totalSyncedTE} synced`);
  }

  console.log(`\n\n✅ Done`);
  console.log(`📎 Children synced: ${totalChildren}`);
  console.log(`⏱️  Time entries: ${totalRemoteTE} remote, ${totalSyncedTE} synced to DB`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
