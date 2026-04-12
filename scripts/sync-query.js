#!/usr/bin/env node
/**
 * Sync issues from a Redmine saved query.
 * Uses: /issues.json?query_id=<queryId>
 *
 * Note: Some saved queries may not be accessible via REST API
 *       (private queries, or those requiring special permissions).
 *
 * Usage: node scripts/sync-query.js <query_id>
 * My filters: 754 755 749 743 744 and 747
 * Example: node scripts/sync-query.js 744
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const BATCH_PAGES = 20;

const queryId = parseInt(process.argv[2], 10);
if (isNaN(queryId)) {
  console.error("Usage: node scripts/sync-query.js <query_id>");
  console.error("Example: node scripts/sync-query.js 744");
  process.exit(1);
}

function asNumber(val) { const n = Number(val); return Number.isFinite(n) ? n : null; }
function asString(val) { return typeof val === "string" ? val : null; }
function asDate(val) { if (!val) return null; const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
function nestedName(obj) { if (!obj || typeof obj !== "object") return null; return asString(obj.name) ?? null; }
function nestedId(obj) { if (!obj || typeof obj !== "object") return null; return asNumber(obj.id); }

async function fetchPage(offset, retries = 3) {
  const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&query_id=${queryId}&status_id=*`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) { await new Promise(r => setTimeout(r, 5000 * attempt)); continue; }
      console.error(`   HTTP ${res.status} on attempt ${attempt}`);
      return null;
    } catch (err) {
      console.error(`   Error on attempt ${attempt}: ${err.message}`);
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

  console.log(`📋 Syncing issues from saved query #${queryId}`);
  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}`);
  console.log(`📊 Database: Supabase\n`);

  // Get total count
  console.log("📏 Getting count...");
  const countData = await fetchPage(0);
  if (!countData) {
    console.error("❌ Failed to connect to Redmine");
    console.error("\n💡 Possible reasons:");
    console.error("   - Query #747 may be private or restricted");
    console.error("   - API key may lack access to this query");
    console.error("   - The query may not exist or was deleted");
    console.error("   - Try using --project or --filters instead");
    process.exit(1);
  }
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`📋 Total issues in query: ${totalCount.toLocaleString()} (${totalPages} pages)\n`);

  if (totalCount === 0) {
    console.log("✅ No issues found for this query.");
    await prisma.$disconnect();
    return;
  }

  const startTime = Date.now();
  let totalUpserted = 0;

  for (let batchStart = 0; batchStart < totalPages; batchStart += BATCH_PAGES) {
    const batchEnd = Math.min(batchStart + BATCH_PAGES, totalPages);
    let batchIssues = [];

    for (let p = batchStart; p < batchEnd; p++) {
      const data = await fetchPage(p * PAGE_SIZE);
      if (data?.issues?.length > 0) batchIssues.push(...data.issues);
    }

    if (batchIssues.length === 0) continue;

    const payloads = batchIssues.map(issue => buildPayload(userId, issue, baseUrl)).filter(Boolean);

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
    const pct = ((batchEnd / totalPages) * 100).toFixed(1);
    const rate = (totalUpserted / Math.max(1, (Date.now() - startTime) / 1000)).toFixed(1);
    process.stdout.write(`\r📦 Pages ${batchEnd}/${totalPages} (${pct}%) | ↑ ${totalUpserted.toLocaleString()} | ${rate}/s | ${elapsed}s`);

    if (batchEnd < totalPages) await new Promise(r => setTimeout(r, 1000));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalInDb = await prisma.issue.count({ where: { userId } });

  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`📈 Total issues in DB for user: ${totalInDb.toLocaleString()}`);
  console.log(`📥 Issues synced: ${totalUpserted.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
