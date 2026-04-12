#!/usr/bin/env node
/**
 * Fast bulk sync using raw SQL upsert for maximum throughput.
 * Usage: node scripts/sync-all-issues-fast.js [--from-offset 0]
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const BATCH_PAGES = 100; // 10K issues per batch
const BATCH_DELAY_MS = 2000; // Wait between batches to avoid rate limiting

let userId, baseUrl;

function asNumber(val) { const n = Number(val); return Number.isFinite(n) ? n : null; }
function asString(val) { return typeof val === "string" ? val : null; }
function asDate(val) { if (!val) return null; const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
function nestedName(obj) { if (!obj || typeof obj !== "object") return null; return asString(obj.name) ?? null; }
function nestedId(obj) { if (!obj || typeof obj !== "object") return null; return asNumber(obj.id); }

async function fetchPage(offset, retries = 3) {
  const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&status_id=*`;
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

function buildValuesArray(issues, userId, baseUrl) {
  const values = [];
  for (const issueRaw of issues) {
    const remoteId = asNumber(issueRaw.id);
    if (!remoteId) continue;

    const updatedOn = asDate(issueRaw.updated_on) ?? new Date();
    const subject = JSON.stringify(asString(issueRaw.subject) ?? `Issue #${remoteId}`);
    const description = JSON.stringify(asString(issueRaw.description));
    const projectName = JSON.stringify(nestedName(issueRaw.project));
    const tracker = JSON.stringify(nestedName(issueRaw.tracker));
    const priority = JSON.stringify(nestedName(issueRaw.priority));
    const priorityId = nestedId(issueRaw.priority);
    const statusId = nestedId(issueRaw.status) ?? 0;
    const statusName = JSON.stringify(nestedName(issueRaw.status) ?? "Unknown");
    const parentIssueId = nestedId(issueRaw.parent);
    const parentIssueLabel = JSON.stringify(nestedId(issueRaw.parent) ? `#${nestedId(issueRaw.parent)}` : null);
    const assignedToId = nestedId(issueRaw.assigned_to);
    const assignedToName = JSON.stringify(nestedName(issueRaw.assigned_to));
    const authorId = nestedId(issueRaw.author);
    const authorName = JSON.stringify(nestedName(issueRaw.author));
    const categoryId = nestedId(issueRaw.category);
    const categoryName = JSON.stringify(nestedName(issueRaw.category));
    const startDate = asDate(issueRaw.start_date);
    const estimatedHours = asNumber(issueRaw.estimated_hours);
    const spentHours = asNumber(issueRaw.spent_hours);
    const customFieldsJson = Array.isArray(issueRaw.custom_fields) ? JSON.stringify(issueRaw.custom_fields) : 'null';
    const dueDate = asDate(issueRaw.due_date);
    const doneRatio = asNumber(issueRaw.done_ratio);
    const childrenJson = Array.isArray(issueRaw.children) ? JSON.stringify(issueRaw.children) : 'null';

    const userIdStr = JSON.stringify(userId);
    const baseUrlStr = JSON.stringify(baseUrl);
    const updatedOnStr = `'${updatedOn.toISOString().slice(0, 23)}Z'`;
    const startDateStr = startDate ? `'${startDate.toISOString().slice(0, 23)}Z'` : 'null';
    const dueDateStr = dueDate ? `'${dueDate.toISOString().slice(0, 23)}Z'` : 'null';
    const parentIssueIdStr = parentIssueId ?? 'null';
    const priorityIdStr = priorityId ?? 'null';
    const assignedToIdStr = assignedToId ?? 'null';
    const authorIdStr = authorId ?? 'null';
    const categoryIdStr = categoryId ?? 'null';
    const estimatedHoursStr = estimatedHours != null ? String(estimatedHours) : 'null';
    const spentHoursStr = spentHours != null ? String(spentHours) : 'null';
    const doneRatioStr = doneRatio != null ? String(doneRatio) : 'null';

    values.push(
      `(${userIdStr},${remoteId},${baseUrlStr},${subject},${description},${projectName},${tracker},${priority},${priorityIdStr},${statusId},${statusName},${parentIssueIdStr},${parentIssueLabel},${assignedToIdStr},${assignedToName},${authorIdStr},${authorName},${categoryIdStr},${categoryName},${startDateStr},${estimatedHoursStr},${spentHoursStr},${customFieldsJson},${updatedOnStr},${dueDateStr},${doneRatioStr},${childrenJson})`
    );
  }
  return values;
}

async function bulkUpsert(values) {
  if (values.length === 0) return 0;

  const columns = [
    'userId','redmineIssueId','redmineBaseUrl','subject','description','projectName',
    'tracker','priority','priorityId','statusId','statusName','parentIssueId',
    'parentIssueLabel','assignedToId','assignedToName','authorId','authorName',
    'categoryId','categoryName','startDate','estimatedHours','spentHours',
    'customFieldsJson','updatedOnRemote','dueDate','doneRatio','childrenJson'
  ];

  const updateCols = columns.filter(c => c !== 'userId' && c !== 'redmineIssueId' && c !== 'redmineBaseUrl');
  const updateSet = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

  const sql = `
    INSERT INTO "Issue" (${columns.map(c => `"${c}"`).join(', ')})
    VALUES ${values.join(', ')}
    ON CONFLICT ("userId", "redmineBaseUrl", "redmineIssueId")
    DO UPDATE SET ${updateSet}
  `;

  await prisma.$executeRawUnsafe(sql);
  return values.length;
}

async function main() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) { console.error("❌ Missing env"); process.exit(1); }

  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true }, select: { userId: true, baseUrl: true },
  });
  if (!cred) { console.error("❌ No credential"); process.exit(1); }
  userId = cred.userId;
  baseUrl = cred.baseUrl.replace(/\/+$/, "");

  const countData = await fetchPage(0);
  if (!countData) { console.error("❌ Can't get count"); process.exit(1); }
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const startOffset = parseInt(process.argv.find(a => a === "--from-offset") || "0", 10) || 0;
  const startPage = Math.floor(startOffset / PAGE_SIZE);

  console.log(`📋 Total: ${totalCount.toLocaleString()} issues (${totalPages} pages)`);
  console.log(`▶️  Starting from page ${startPage + 1}/${totalPages}`);
  console.log(`🚀 Using raw SQL upsert for maximum throughput\n`);

  const startTime = Date.now();
  let totalUpserted = 0;

  for (let batchStart = startPage; batchStart < totalPages; batchStart += BATCH_PAGES) {
    const batchEnd = Math.min(batchStart + BATCH_PAGES, totalPages);
    let batchIssues = [];

    // Fetch batch with minimal spacing
    for (let p = batchStart; p < batchEnd; p++) {
      const data = await fetchPage(p * PAGE_SIZE);
      if (data?.issues?.length > 0) batchIssues.push(...data.issues);
    }

    if (batchIssues.length === 0) continue;

    // Build and execute bulk upsert
    const values = buildValuesArray(batchIssues, userId, baseUrl);
    const upserted = await bulkUpsert(values);
    totalUpserted += upserted;

    // Progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pagesDone = batchEnd;
    const pct = ((pagesDone / totalPages) * 100).toFixed(1);
    const rate = (totalUpserted / (Date.now() - startTime) * 1000).toFixed(1);
    const etaMin = ((totalPages - pagesDone) / BATCH_PAGES * (Date.now() - startTime) / pagesDone / 60).toFixed(0);
    process.stdout.write(`\r📦 Pages ${pagesDone}/${totalPages} (${pct}%) | ↑ ${totalUpserted.toLocaleString()} | ${rate}/s | ETA: ~${etaMin}m`);

    // Batch delay to avoid rate limiting
    if (batchEnd < totalPages) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalInDb = await prisma.issue.count({ where: { userId } });
  const withParent = await prisma.issue.count({ where: { userId, parentIssueId: { not: null } } });

  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`📈 Total in DB: ${totalInDb.toLocaleString()}`);
  console.log(`📎 With parent: ${withParent.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
