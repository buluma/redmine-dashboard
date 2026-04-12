#!/usr/bin/env node
/**
 * Sync only issues assigned to or authored by the authenticated user.
 * Much faster than full sync — typically a few hundred issues vs 100K+.
 *
 * Usage: node scripts/sync-assigned.js
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const BATCH_PAGES = 20;

function asNumber(val) { const n = Number(val); return Number.isFinite(n) ? n : null; }
function asString(val) { return typeof val === "string" ? val : null; }
function asDate(val) { if (!val) return null; const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
function nestedName(obj) { if (!obj || typeof obj !== "object") return null; return asString(obj.name) ?? null; }
function nestedId(obj) { if (!obj || typeof obj !== "object") return null; return asNumber(obj.id); }

async function fetchPage(filter, offset, retries = 3) {
  // filter: "assigned_to_id=me" or "author_id=me"
  const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&${filter}&status_id=*`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) { await new Promise(r => setTimeout(r, 5000 * attempt)); continue; }
      return null;
    } catch {
      if (attempt < retries) await new Promise(r => setTimeout(r, 3000 * attempt));
      else return null;
    }
  }
  return null;
}

function buildPayload(userId, issueRaw, baseUrl) {
  const remoteId = asNumber(issueRaw.id);
  if (!remoteId) return null;

  const updatedOn = asDate(issueRaw.updated_on) ?? new Date();
  return {
    userId,
    redmineIssueId: remoteId,
    redmineBaseUrl: baseUrl,
    subject: asString(issueRaw.subject) ?? `Issue #${remoteId}`,
    description: asString(issueRaw.description),
    projectName: nestedName(issueRaw.project),
    tracker: nestedName(issueRaw.tracker),
    priority: nestedName(issueRaw.priority),
    priorityId: nestedId(issueRaw.priority),
    statusId: nestedId(issueRaw.status) ?? 0,
    statusName: nestedName(issueRaw.status) ?? "Unknown",
    parentIssueId: nestedId(issueRaw.parent),
    parentIssueLabel: nestedId(issueRaw.parent) ? `#${nestedId(issueRaw.parent)}` : null,
    assignedToId: nestedId(issueRaw.assigned_to),
    assignedToName: nestedName(issueRaw.assigned_to),
    authorId: nestedId(issueRaw.author),
    authorName: nestedName(issueRaw.author),
    categoryId: nestedId(issueRaw.category),
    categoryName: nestedName(issueRaw.category),
    startDate: asDate(issueRaw.start_date),
    estimatedHours: asNumber(issueRaw.estimated_hours),
    spentHours: asNumber(issueRaw.spent_hours),
    customFieldsJson: Array.isArray(issueRaw.custom_fields) ? issueRaw.custom_fields : null,
    updatedOnRemote: updatedOn,
    dueDate: asDate(issueRaw.due_date),
    doneRatio: asNumber(issueRaw.done_ratio),
    childrenJson: Array.isArray(issueRaw.children) ? issueRaw.children : null,
  };
}

async function fetchAllIssues(filter) {
  const allIssues = [];
  const countData = await fetchPage(filter, 0);
  if (!countData) return { total: 0, issues: [] };
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  for (let p = 0; p < totalPages; p++) {
    const data = await fetchPage(filter, p * PAGE_SIZE);
    if (data?.issues?.length > 0) allIssues.push(...data.issues);
  }
  return { total: totalCount, issues: allIssues };
}

async function main() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    console.error("❌ Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
    process.exit(1);
  }

  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true }, select: { userId: true, baseUrl: true },
  });
  if (!cred) { console.error("❌ No active Redmine credential found"); process.exit(1); }

  const userId = cred.userId;
  const baseUrl = cred.baseUrl.replace(/\/+$/, "");

  console.log("👤 Syncing assigned and authored issues");
  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}`);
  console.log(`📊 Database: Supabase\n`);

  // Fetch both assigned and authored issues
  console.log("📏 Fetching assigned issues...");
  const assigned = await fetchAllIssues("assigned_to_id=me");
  console.log(`   ${assigned.total.toLocaleString()} assigned`);

  console.log("📏 Fetching authored issues...");
  const authored = await fetchAllIssues("author_id=me");
  console.log(`   ${authored.total.toLocaleString()} authored`);

  // Merge and deduplicate by issue ID
  const issueMap = new Map();
  for (const issue of [...assigned.issues, ...authored.issues]) {
    issueMap.set(issue.id, issue);
  }
  const allIssues = Array.from(issueMap.values());
  console.log(`\n📋 Total unique issues: ${allIssues.length.toLocaleString()}\n`);

  if (allIssues.length === 0) {
    console.log("✅ No issues found.");
    await prisma.$disconnect();
    return;
  }

  const startTime = Date.now();
  let totalUpserted = 0;

  for (let i = 0; i < allIssues.length; i += BATCH_PAGES * PAGE_SIZE) {
    const batchEnd = Math.min(i + BATCH_PAGES * PAGE_SIZE, allIssues.length);
    const batch = allIssues.slice(i, batchEnd);
    const payloads = batch.map(issue => buildPayload(userId, issue, baseUrl)).filter(Boolean);

    const results = await Promise.allSettled(
      payloads.map(async (p) => {
        await prisma.issue.upsert({
          where: {
            userId_redmineBaseUrl_redmineIssueId: {
              userId: p.userId,
              redmineBaseUrl: p.redmineBaseUrl,
              redmineIssueId: p.redmineIssueId,
            },
          },
          update: p,
          create: p,
        });
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalUpserted++;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = ((batchEnd / allIssues.length) * 100).toFixed(1);
    const rate = (totalUpserted / Math.max(1, (Date.now() - startTime) / 1000)).toFixed(1);
    process.stdout.write(`\r📦 Issues ${batchEnd}/${allIssues.length} (${pct}%) | ↑ ${totalUpserted.toLocaleString()} | ${rate}/s | ${elapsed}s`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalInDb = await prisma.issue.count({ where: { userId } });
  const withParent = await prisma.issue.count({ where: { userId, parentIssueId: { not: null } } });

  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`📈 Total issues in DB for user: ${totalInDb.toLocaleString()}`);
  console.log(`📎 Issues with parent: ${withParent.toLocaleString()}`);
  console.log(`📥 Assigned issues: ${assigned.total.toLocaleString()}`);
  console.log(`📥 Authored issues: ${authored.total.toLocaleString()}`);
  console.log(`📥 Total unique synced: ${totalUpserted.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
