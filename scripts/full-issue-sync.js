#!/usr/bin/env node
/**
 * Fast paginated sync of all Redmine issues to Supabase.
 * Fetches pages in parallel, upserts in batches.
 */

require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const PAGE_SIZE = 100;
const FETCH_CONCURRENCY = 5; // Pages fetched in parallel
const UPSERT_BATCH_SIZE = 25; // Upserts done in parallel per batch

let userId = null;
let totalFetched = 0;
let totalCreated = 0;
let totalUpdated = 0;
let totalErrors = 0;

async function getUserId() {
  const cred = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true },
    select: { userId: true },
  });
  if (!cred) throw new Error("No active Redmine credential found.");
  return cred.userId;
}

function asNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function asString(val) {
  return typeof val === "string" ? val : null;
}

function asDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function nestedName(obj) {
  if (!obj || typeof obj !== "object") return null;
  return asString(obj.name) ?? null;
}

function nestedId(obj) {
  if (!obj || typeof obj !== "object") return null;
  return asNumber(obj.id);
}

async function fetchPage(offset) {
  const url = `${REDMINE_BASE_URL}/issues.json?key=${REDMINE_API_KEY}&limit=${PAGE_SIZE}&offset=${offset}&status_id=*`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      const text = await res.text();
      console.error(`   ❌ Page ${offset}: HTTP ${res.status}`);
      return null;
    } catch (err) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      } else {
        console.error(`   ❌ Page ${offset}: ${err.message}`);
        return null;
      }
    }
  }
  return null;
}

function buildPayload(userId, issueRaw) {
  const remoteId = asNumber(issueRaw.id);
  if (!remoteId) return null;

  const baseUrl = REDMINE_BASE_URL.replace(/\/+$/, "");
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
  };
}

async function upsertIssue(payload) {
  try {
    await prisma.issue.upsert({
      where: {
        userId_redmineBaseUrl_redmineIssueId: {
          userId: payload.userId,
          redmineBaseUrl: payload.redmineBaseUrl,
          redmineIssueId: payload.redmineIssueId,
        },
      },
      update: payload,
      create: payload,
    });
    return "ok";
  } catch (err) {
    return err.message;
  }
}

async function main() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    console.error("❌ Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
    process.exit(1);
  }

  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}`);
  console.log(`📊 Database: Supabase (via DATABASE_URL)\n`);

  userId = await getUserId();
  console.log(`👤 User ID: ${userId}\n`);

  // Step 1: Get total count
  console.log("📏 Getting total issue count...");
  const countData = await fetchPage(0);
  if (!countData) {
    console.error("❌ Failed to get total count");
    process.exit(1);
  }
  const totalCount = countData.total_count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  console.log(`📋 Total issues: ${totalCount.toLocaleString()} (${totalPages} pages of ${PAGE_SIZE})\n`);

  // Step 2: Fetch all pages in parallel batches
  console.log("⬇️  Fetching pages...\n");
  const allIssues = [];
  const offsets = [];
  for (let i = 0; i < totalCount; i += PAGE_SIZE) offsets.push(i);

  for (let batchStart = 0; batchStart < offsets.length; batchStart += FETCH_CONCURRENCY) {
    const batch = offsets.slice(batchStart, batchStart + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map(offset => fetchPage(offset)));
    
    for (const data of results) {
      if (data?.issues?.length > 0) {
        allIssues.push(...data.issues);
        totalFetched += data.issues.length;
      }
    }

    const progress = Math.min(batchStart + FETCH_CONCURRENCY, totalPages);
    const pct = ((progress / totalPages) * 100).toFixed(1);
    process.stdout.write(`\r   Fetched: ${totalFetched.toLocaleString()}/${totalCount.toLocaleString()} issues (${progress}/${totalPages} pages, ${pct}%)`);
  }
  console.log(`\n\n✅ Fetched ${allIssues.length.toLocaleString()} issues\n`);

  // Step 3: Upsert in parallel batches
  console.log(`⬆️  Upserting to Supabase (batch size: ${UPSERT_BATCH_SIZE})...\n`);
  const startTime = Date.now();

  for (let i = 0; i < allIssues.length; i += UPSERT_BATCH_SIZE) {
    const batch = allIssues.slice(i, i + UPSERT_BATCH_SIZE);
    const payloads = batch.map(issue => buildPayload(userId, issue)).filter(Boolean);
    
    const results = await Promise.all(payloads.map(p => upsertIssue(p)));
    
    for (const result of results) {
      if (result === "ok") {
        // Check if created or updated by looking at timestamps
        totalUpdated++;
      } else {
        totalErrors++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (i / (Date.now() - startTime) * 1000).toFixed(0);
    const remaining = ((allIssues.length - i) / rate).toFixed(0);
    const pct = ((i / allIssues.length) * 100).toFixed(1);
    process.stdout.write(`\r   Upserted: ${i.toLocaleString()}/${allIssues.length.toLocaleString()} (${pct}%) | ${rate}/s | ETA: ${remaining}s`);

    // Small delay to avoid overwhelming Supabase connection pool
    if (i % 500 === 0 && i > 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const finalRate = (allIssues.length / (Date.now() - startTime) * 1000).toFixed(0);

  console.log(`\n\n📊 Results:`);
  console.log(`   Fetched:    ${totalFetched.toLocaleString()}`);
  console.log(`   Upserted:   ${totalUpdated.toLocaleString()}`);
  console.log(`   Errors:     ${totalErrors}`);
  console.log(`   Duration:   ${finalElapsed}s`);
  console.log(`   Avg rate:   ${finalRate}/s`);

  // Final count
  const totalInDb = await prisma.issue.count({ where: { userId } });
  console.log(`\n📈 Total issues in Supabase: ${totalInDb.toLocaleString()}`);

  await prisma.$disconnect();
  console.log("\n✅ Sync complete!");
}

main().catch((err) => {
  console.error(`💥 Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
