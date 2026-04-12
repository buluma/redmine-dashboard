#!/usr/bin/env node
/**
 * Sync only issues assigned to the authenticated user.
 * Much faster than full sync — typically a few hundred issues vs 100K+.
 * 
 * Usage: node scripts/sync-assigned-issues.js
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const BATCH_PAGES = 20; // 2000 issues per batch (usually plenty for assigned)

function asNumber(val) { const n = Number(val); return Number.isFinite(n) ? n : null; }
function asString(val) { return typeof val === "string" ? val : null; }
function asDate(val) { if (!val) return null; const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
function nestedName(obj) { if (!obj || typeof obj !== "object") return null; return asString(obj.name) ?? null; }
function nestedId(obj) { if (!obj || typeof obj !== "object") return null; return asNumber(obj.id); }

async function fetchPage(offset, retries = 3) {
  // assigned_to_id=me filters to current user's issues
  const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&assigned_to_id=me&status_id=*`;
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

async function bulkUpsert(payloads) {
  if (payloads.length === 0) return { created: 0, updated: 0 };

  const columns = [
    'userId','redmineIssueId','redmineBaseUrl','subject','description','projectName',
    'tracker','priority','priorityId','statusId','statusName','parentIssueId',
    'parentIssueLabel','assignedToId','assignedToName','authorId','authorName',
    'categoryId','categoryName','startDate','estimatedHours','spentHours',
    'customFieldsJson','updatedOnRemote','dueDate','doneRatio','childrenJson'
  ];

  const updateCols = columns.filter(c => c !== 'userId' && c !== 'redmineIssueId' && c !== 'redmineBaseUrl');
  const updateSet = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

  const values = payloads.map(p => {
    const v = [
      `'${p.userId}'`, p.redmineIssueId, `'${p.redmineBaseUrl}'`,
      JSON.stringify(p.subject), JSON.stringify(p.description), JSON.stringify(p.projectName),
      JSON.stringify(p.tracker), JSON.stringify(p.priority), p.priorityId ?? 'null',
      p.statusId, JSON.stringify(p.statusName), p.parentIssueId ?? 'null',
      JSON.stringify(p.parentIssueLabel), p.assignedToId ?? 'null', JSON.stringify(p.assignedToName),
      p.authorId ?? 'null', JSON.stringify(p.authorName), p.categoryId ?? 'null',
      JSON.stringify(p.categoryName), p.startDate ? `'${p.startDate.toISOString().slice(0, 23)}Z'` : 'null',
      p.estimatedHours != null ? p.estimatedHours : 'null',
      p.spentHours != null ? p.spentHours : 'null',
      p.customFieldsJson ? JSON.stringify(p.customFieldsJson) : 'null',
      `'${p.updatedOnRemote.toISOString().slice(0, 23)}Z'`,
      p.dueDate ? `'${p.dueDate.toISOString().slice(0, 23)}Z'` : 'null',
      p.doneRatio != null ? p.doneRatio : 'null',
      p.childrenJson ? JSON.stringify(p.childrenJson) : 'null',
    ];
    return `(${v.join(',')})`;
  });

  const sql = `
    INSERT INTO "Issue" (${columns.map(c => `"${c}"`).join(', ')})
    VALUES ${values.join(', ')}
    ON CONFLICT ("userId", "redmineBaseUrl", "redmineIssueId")
    DO UPDATE SET ${updateSet}
  `;

  await prisma.$executeRawUnsafe(sql);
  return { created: 0, updated: payloads.length };
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

  console.log("👤 Syncing assigned issues only (assigned_to_id=me)");
  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}`);
  console.log(`📊 Database: Supabase\n`);

  // Get total count
  console.log("📏 Getting count...");
  const countData = await fetchPage(0);
  if (!countData) { console.error("❌ Failed to connect to Redmine"); process.exit(1); }
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`📋 Total assigned issues: ${totalCount.toLocaleString()} (${totalPages} pages)\n`);

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
    await bulkUpsert(payloads);
    totalUpserted += payloads.length;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = ((batchEnd / totalPages) * 100).toFixed(1);
    const rate = (totalUpserted / Math.max(1, (Date.now() - startTime) / 1000)).toFixed(1);
    process.stdout.write(`\r📦 Pages ${batchEnd}/${totalPages} (${pct}%) | ↑ ${totalUpserted.toLocaleString()} | ${rate}/s | ${elapsed}s`);

    if (batchEnd < totalPages) await new Promise(r => setTimeout(r, 1000));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalInDb = await prisma.issue.count({ where: { userId } });
  const withParent = await prisma.issue.count({ where: { userId, parentIssueId: { not: null } } });

  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`📈 Total issues in DB for user: ${totalInDb.toLocaleString()}`);
  console.log(`📎 Issues with parent: ${withParent.toLocaleString()}`);
  console.log(`📥 Assigned issues synced: ${totalUpserted.toLocaleString()}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(`💥 ${err.message}`); process.exit(1); });
