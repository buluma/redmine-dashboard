#!/usr/bin/env node
/**
 * Chunked sync: fetch a batch, upsert it, repeat.
 * Shows progress immediately and uses minimal memory.
 * Usage: node scripts/sync-all-issues.js [--from-offset 0]
 */

require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const BATCH_PAGES = 10; // Fetch 10 pages per batch = 1000 issues
const UPSERT_CONCURRENCY = 50;

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

function buildPayload(issueRaw) {
  const remoteId = asNumber(issueRaw.id);
  if (!remoteId) return null;
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
    updatedOnRemote: asDate(issueRaw.updated_on) ?? new Date(),
    dueDate: asDate(issueRaw.due_date),
    doneRatio: asNumber(issueRaw.done_ratio),
    childrenJson: Array.isArray(issueRaw.children) ? issueRaw.children : null,
  };
}

async function main() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) { console.error("❌ Missing env"); process.exit(1); }

  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true }, select: { userId: true, baseUrl: true },
  });
  if (!cred) { console.error("❌ No credential"); process.exit(1); }
  userId = cred.userId;
  baseUrl = cred.baseUrl.replace(/\/+$/, "");

  // Get total count
  const countData = await fetchPage(0);
  if (!countData) { console.error("❌ Can't get count"); process.exit(1); }
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const startOffset = parseInt(process.argv.find(a => a === "--from-offset") || "0", 10) || 0;
  const startPage = Math.floor(startOffset / PAGE_SIZE);

  console.log(`📋 Total: ${totalCount.toLocaleString()} issues (${totalPages} pages)`);
  console.log(`▶️  Starting from page ${startPage + 1}/${totalPages}\n`);

  const startTime = Date.now();
  let totalFetched = 0;
  let totalUpserted = 0;
  let totalErrors = 0;

  for (let batchStart = startPage; batchStart < totalPages; batchStart += BATCH_PAGES) {
    const pages = [];
    for (let p = 0; p < BATCH_PAGES && (batchStart + p) < totalPages; p++) {
      pages.push(batchStart + p);
    }

    // Fetch batch
    const results = await Promise.all(
      pages.map(async (page) => {
        await new Promise(r => setTimeout(r, 30)); // Minimal spacing
        const data = await fetchPage(page * PAGE_SIZE);
        return { page, data };
      })
    );

    let batchIssues = [];
    for (const { page, data } of results) {
      if (data?.issues?.length > 0) batchIssues.push(...data.issues);
    }
    totalFetched += batchIssues.length;

    // Upsert batch
    for (let i = 0; i < batchIssues.length; i += UPSERT_CONCURRENCY) {
      const chunk = batchIssues.slice(i, i + UPSERT_CONCURRENCY);
      const payloads = chunk.map(buildPayload).filter(Boolean);

      const upResults = await Promise.allSettled(
        payloads.map(async (p) => {
          await prisma.issue.upsert({
            where: {
              userId_redmineBaseUrl_redmineIssueId: {
                userId: p.userId, redmineBaseUrl: p.redmineBaseUrl, redmineIssueId: p.redmineIssueId,
              },
            },
            update: p,
            create: p,
          });
        })
      );

      for (const r of upResults) {
        if (r.status === "fulfilled") totalUpserted++;
        else totalErrors++;
      }
    }

    // Progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const pagesDone = Math.min(batchStart + BATCH_PAGES, totalPages);
    const pct = ((pagesDone / totalPages) * 100).toFixed(1);
    const rate = (totalUpserted / (Date.now() - startTime) * 1000).toFixed(1);
    const etaSec = ((totalPages - pagesDone) / BATCH_PAGES) * ((Date.now() - startTime) / pagesDone) ;
    const etaMin = (etaSec / 60).toFixed(0);
    process.stdout.write(`\r📦 Pages ${pagesDone}/${totalPages} (${pct}%) | ↑ ${totalUpserted.toLocaleString()} | err: ${totalErrors} | ${rate}/s | ETA: ~${etaMin}m`);

    // Pause between batches
    if (pagesDone < totalPages) await new Promise(r => setTimeout(r, 500));
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
