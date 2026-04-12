#!/usr/bin/env node
/**
 * Full sync for large Redmine instances (e.g. 100k+ issues).
 *
 * This script intentionally runs outside the web app sync job queue so it does
 * not depend on REDMINE_SYNC_ISSUE_SCOPE and does not affect runtime defaults.
 *
 * Usage:
 *   node scripts/sync-all-issues.js
 *   node scripts/sync-all-issues.js --max-pages=10
 *   node scripts/sync-all-issues.js --from-offset=5000 --no-resume
 *
 * Optional flags:
 *   --page-size=<n>      (default: 100)
 *   --concurrency=<n>    (default: 20)
 *   --sleep-ms=<n>       (default: 250)
 *   --max-pages=<n>      (default: unlimited)
 *   --from-offset=<n>    (default: resume checkpoint or 0)
 *   --resume-file=<path> (default: /tmp/redmine-sync-all-progress.json)
 *   --no-resume          (disable checkpoint read/write)
 *   --reset-resume       (delete resume checkpoint then exit)
 */

require("dotenv").config({ path: ".env" });
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 20;
const DEFAULT_SLEEP_MS = 250;
const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_RESUME_FILE = path.join(os.tmpdir(), "redmine-sync-all-progress.json");

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asString(value) {
  return typeof value === "string" ? value : null;
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nestedName(obj) {
  if (!obj || typeof obj !== "object") return null;
  return asString(obj.name) ?? null;
}

function nestedId(obj) {
  if (!obj || typeof obj !== "object") return null;
  return asNumber(obj.id);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function parseIntArg(flag, fallback = null) {
  const raw = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(flag.length + 1));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function parseStringArg(flag, fallback = null) {
  const raw = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (!raw) return fallback;
  const value = raw.slice(flag.length + 1).trim();
  return value.length > 0 ? value : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readCheckpoint(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCheckpoint(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function removeCheckpoint(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function fetchIssuesPage(baseUrl, apiKey, offset, pageSize) {
  const url =
    `${baseUrl}/issues.json?key=${encodeURIComponent(apiKey)}` +
    `&status_id=*&sort=updated_on:desc&limit=${pageSize}&offset=${offset}`;

  for (let attempt = 1; attempt <= DEFAULT_RETRY_LIMIT; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < DEFAULT_RETRY_LIMIT) {
        const waitMs = 1000 * 2 ** (attempt - 1);
        console.warn(`   WARN: HTTP ${res.status}, retrying in ${waitMs}ms (attempt ${attempt}/${DEFAULT_RETRY_LIMIT})`);
        await sleep(waitMs);
        continue;
      }

      const body = await res.text();
      throw new Error(`Redmine request failed (HTTP ${res.status}): ${body.slice(0, 240)}`);
    } catch (error) {
      if (attempt < DEFAULT_RETRY_LIMIT) {
        const waitMs = 1000 * 2 ** (attempt - 1);
        console.warn(`   WARN: Request error, retrying in ${waitMs}ms (attempt ${attempt}/${DEFAULT_RETRY_LIMIT})`);
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to fetch Redmine page after retries");
}

function buildPayload(userId, issueRaw, baseUrl) {
  const remoteId = asNumber(issueRaw.id);
  if (!remoteId) return null;

  const parentId = nestedId(issueRaw.parent);

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
    parentIssueId: parentId,
    parentIssueLabel: parentId ? `#${parentId}` : null,
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

async function upsertBatch(payloads) {
  let success = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    payloads.map(async (payload) => {
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
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      success += 1;
    } else {
      failed += 1;
    }
  }

  return { success, failed };
}

async function main() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    throw new Error("Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
  }

  const pageSize = Math.max(1, parseIntArg("--page-size", DEFAULT_PAGE_SIZE));
  const concurrency = Math.max(1, parseIntArg("--concurrency", DEFAULT_CONCURRENCY));
  const sleepMs = Math.max(0, parseIntArg("--sleep-ms", DEFAULT_SLEEP_MS));
  const maxPages = parseIntArg("--max-pages", null);
  const fromOffsetArg = parseIntArg("--from-offset", null);
  const resumeFile = parseStringArg("--resume-file", DEFAULT_RESUME_FILE);
  const noResume = hasFlag("--no-resume");
  const resetResume = hasFlag("--reset-resume");

  if (resetResume) {
    removeCheckpoint(resumeFile);
    console.log(`Removed checkpoint: ${resumeFile}`);
    return;
  }

  const credential = await prisma.userRedmineCredential.findFirst({
    where: { isActive: true },
    select: { userId: true, baseUrl: true },
  });
  if (!credential) {
    throw new Error("No active Redmine credential found in database");
  }

  const userId = credential.userId;
  const credentialBaseUrl = credential.baseUrl.replace(/\/+$/, "");
  const envBaseUrl = REDMINE_BASE_URL.replace(/\/+$/, "");
  if (envBaseUrl !== credentialBaseUrl) {
    console.warn("WARN: REDMINE_BASE_URL differs from active credential base URL.");
    console.warn(`   ENV:  ${envBaseUrl}`);
    console.warn(`   DB:   ${credentialBaseUrl}`);
    console.warn("   Using active credential base URL for issue ownership key.");
  }

  let offset = 0;
  if (fromOffsetArg !== null) {
    offset = fromOffsetArg;
  } else if (!noResume) {
    const checkpoint = readCheckpoint(resumeFile);
    if (checkpoint && Number.isFinite(checkpoint.nextOffset)) {
      offset = Math.max(0, Number(checkpoint.nextOffset));
      console.log(`Resuming from offset ${offset.toLocaleString()} (${resumeFile})`);
    }
  }

  console.log("Full Redmine Issue Sync (all issues)");
  console.log(`Redmine:      ${REDMINE_BASE_URL}`);
  console.log(`User ID:      ${userId}`);
  console.log(`Page Size:    ${pageSize}`);
  console.log(`Concurrency:  ${concurrency}`);
  console.log(`Sleep/Page:   ${sleepMs}ms`);
  console.log(`Start Offset: ${offset.toLocaleString()}`);
  if (maxPages !== null) console.log(`Max Pages:    ${maxPages}`);
  if (!noResume) console.log(`Resume File:  ${resumeFile}`);
  console.log("");

  const startedAt = Date.now();
  let processedPages = 0;
  let totalSeen = 0;
  let totalUpserted = 0;
  let totalFailed = 0;
  let totalCount = null;
  let stopRequested = false;

  const onSignal = (signal) => {
    stopRequested = true;
    console.warn(`\nWARN: ${signal} received; finishing current page then stopping...`);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  while (!stopRequested) {
    if (maxPages !== null && processedPages >= maxPages) {
      break;
    }

    const data = await fetchIssuesPage(REDMINE_BASE_URL, REDMINE_API_KEY, offset, pageSize);
    if (totalCount === null) {
      totalCount = Number(data.total_count ?? 0);
      console.log(`Remote issue count: ${totalCount.toLocaleString()}`);
    }

    const issues = Array.isArray(data.issues) ? data.issues : [];
    if (issues.length === 0) {
      break;
    }

    const payloads = issues
      .map((issueRaw) => buildPayload(userId, issueRaw, credentialBaseUrl))
      .filter(Boolean);

    let pageUpserted = 0;
    let pageFailed = 0;
    for (const group of chunk(payloads, concurrency)) {
      const stats = await upsertBatch(group);
      pageUpserted += stats.success;
      pageFailed += stats.failed;
    }

    processedPages += 1;
    totalSeen += issues.length;
    totalUpserted += pageUpserted;
    totalFailed += pageFailed;
    offset += issues.length;

    const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const rate = (totalUpserted / elapsedSec).toFixed(1);
    const pct =
      totalCount && totalCount > 0
        ? ((Math.min(offset, totalCount) / totalCount) * 100).toFixed(2)
        : "0.00";

    process.stdout.write(
      `\rpage=${processedPages.toLocaleString()} offset=${offset.toLocaleString()}` +
        `/${(totalCount ?? 0).toLocaleString()} (${pct}%)` +
        ` | upserted=${totalUpserted.toLocaleString()} failed=${totalFailed.toLocaleString()}` +
        ` | rate=${rate}/s`,
    );

    if (!noResume) {
      writeCheckpoint(resumeFile, {
        updatedAt: new Date().toISOString(),
        nextOffset: offset,
        processedPages,
        totalCount,
        totalSeen,
        totalUpserted,
        totalFailed,
        pageSize,
        concurrency,
        redmineBaseUrl: REDMINE_BASE_URL,
        userId,
      });
    }

    if (offset >= totalCount) {
      break;
    }
    await sleep(sleepMs);
  }

  process.stdout.write("\n");

  const elapsedSec = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  const completedAll = !stopRequested && totalCount !== null && offset >= totalCount;

  if (completedAll && !noResume) {
    removeCheckpoint(resumeFile);
  }

  const dbCount = await prisma.issue.count({ where: { userId } });

  console.log("");
  console.log(stopRequested ? "Stopped early." : completedAll ? "Completed full sync." : "Sync finished.");
  console.log(`Pages processed: ${processedPages.toLocaleString()}`);
  console.log(`Issues fetched:  ${totalSeen.toLocaleString()}`);
  console.log(`Upserts ok:      ${totalUpserted.toLocaleString()}`);
  console.log(`Upserts failed:  ${totalFailed.toLocaleString()}`);
  console.log(`Elapsed:         ${elapsedSec}s`);
  console.log(`DB issues(user): ${dbCount.toLocaleString()}`);
  if (!noResume) {
    console.log(
      completedAll
        ? `Checkpoint cleared: ${resumeFile}`
        : `Checkpoint saved:   ${resumeFile}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
