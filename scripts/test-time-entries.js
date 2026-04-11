#!/usr/bin/env node
/**
 * Test script to query Redmine time entries for issue 113112
 * Uses credentials from .env file
 */

require("dotenv").config({ path: ".env" });

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const ISSUE_ID = 113112;

async function testRedmineAPI() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    console.error("❌ Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
    process.exit(1);
  }

  console.log(`🔗 Redmine URL: ${REDMINE_BASE_URL}`);
  console.log(`📋 Testing issue #${ISSUE_ID}\n`);

  // Test 1: Get issue details
  console.log("1️⃣  Fetching issue details...");
  try {
    const issueRes = await fetch(
      `${REDMINE_BASE_URL}/issues/${ISSUE_ID}.json?key=${REDMINE_API_KEY}&include=journals,attachments,relations,children,allowed_statuses`,
      { cache: "no-store" }
    );
    
    if (!issueRes.ok) {
      console.error(`❌ Failed to fetch issue: ${issueRes.status} ${issueRes.statusText}`);
      const text = await issueRes.text();
      console.error(`Response: ${text}`);
    } else {
      const issueData = await issueRes.json();
      const issue = issueData.issue;
      console.log(`✅ Issue found: #${issue.id} - ${issue.subject}`);
      console.log(`   Status: ${issue.status?.name}`);
      console.log(`   Tracker: ${issue.tracker?.name}`);
      console.log(`   Priority: ${issue.priority?.name}`);
      console.log(`   Project: ${issue.project?.name}`);
      console.log(`   Journals: ${issue.journals?.length ?? 0}`);
      console.log(`   Attachments: ${issue.attachments?.length ?? 0}`);
    }
  } catch (err) {
    console.error(`❌ Error fetching issue: ${err.message}`);
  }

  console.log("");

  // Test 2: Get time entries for the issue
  console.log("2️⃣  Fetching time entries...");
  try {
    const timeRes = await fetch(
      `${REDMINE_BASE_URL}/time_entries.json?issue_id=${ISSUE_ID}&key=${REDMINE_API_KEY}&limit=100`,
      { cache: "no-store" }
    );

    if (!timeRes.ok) {
      console.error(`❌ Failed to fetch time entries: ${timeRes.status} ${timeRes.statusText}`);
      const text = await timeRes.text();
      console.error(`Response: ${text}`);
    } else {
      const timeData = await timeRes.json();
      const entries = timeData.time_entries || [];
      const total = timeData.total_count ?? entries.length;

      console.log(`✅ Found ${entries.length} time entries (total: ${total})`);
      
      if (entries.length === 0) {
        console.log("   ⚠️  No time entries found for this issue");
      } else {
        let totalHours = 0;
        console.log("\n   Time Entries:");
        console.log("   " + "─".repeat(90));
        console.log(
          `   ${"ID".padEnd(8)} ${"Date".padEnd(12)} ${"Hours".padEnd(8)} ${"Activity".padEnd(20)} ${"User".padEnd(18)} Comments`
        );
        console.log("   " + "─".repeat(90));

        for (const entry of entries) {
          const hours = entry.hours ?? 0;
          totalHours += hours;
          const date = entry.spent_on ?? "N/A";
          const activity = entry.activity?.name ?? "N/A";
          const user = entry.user?.name ?? entry.user?.login ?? "Unknown";
          const comments = entry.comments ?? "-";

          console.log(
            `   ${String(entry.id).padEnd(8)} ${date.padEnd(12)} ${String(hours).padEnd(8)} ${activity.padEnd(20)} ${user.padEnd(18)} ${comments}`
          );
        }

        console.log("   " + "─".repeat(90));
        console.log(`   Total Hours: ${totalHours.toFixed(2)}h`);
      }
    }
  } catch (err) {
    console.error(`❌ Error fetching time entries: ${err.message}`);
  }

  console.log("");

  // Test 3: Compare with local database
  console.log("3️⃣  Checking local database...");
  try {
    const localRes = await fetch(`http://localhost:3000/api/time-entries?issueId=${ISSUE_ID}`, {
      cache: "no-store",
    });

    if (!localRes.ok) {
      console.error(`❌ Failed to fetch local time entries: ${localRes.status} ${localRes.statusText}`);
    } else {
      const localData = await localRes.json();
      const localEntries = localData.items || [];
      console.log(`✅ Local database has ${localEntries.length} time entries`);

      if (localEntries.length > 0) {
        let localTotalHours = 0;
        console.log("\n   Local Time Entries:");
        console.log("   " + "─".repeat(90));
        console.log(
          `   ${"ID".padEnd(8)} ${"Date".padEnd(12)} ${"Hours".padEnd(8)} ${"Activity".padEnd(20)} ${"Author".padEnd(18)} Comments`
        );
        console.log("   " + "─".repeat(90));

        for (const entry of localEntries) {
          const hours = entry.hours ?? 0;
          localTotalHours += hours;
          const date = entry.spentOn ?? "N/A";
          const activity = entry.activityName ?? "N/A";
          const author = entry.authorName ?? "Unknown";
          const comments = entry.comments ?? "-";

          console.log(
            `   ${String(entry.id).padEnd(8)} ${date.padEnd(12)} ${String(hours).padEnd(8)} ${activity.padEnd(20)} ${author.padEnd(18)} ${comments}`
          );
        }

        console.log("   " + "─".repeat(90));
        console.log(`   Local Total Hours: ${localTotalHours.toFixed(2)}h`);
      }
    }
  } catch (err) {
    console.error(`❌ Error fetching local time entries: ${err.message}`);
    console.log("   ⚠️  Make sure the dev server is running on localhost:3000");
  }

  console.log("\n✅ Done!");
}

testRedmineAPI().catch((err) => {
  console.error(`💥 Fatal error: ${err.message}`);
  process.exit(1);
});
