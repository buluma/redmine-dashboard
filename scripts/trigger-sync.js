#!/usr/bin/env node
/**
 * Quick sync trigger script
 * Usage: node scripts/trigger-sync.js [session_cookie]
 */

async function triggerSync() {
  console.log("🔄 Triggering sync...\n");
  
  // Try with the session cookie from browser if provided
  const cookie = process.argv[2];
  
  const headers = { "Content-Type": "application/json" };
  if (cookie) {
    headers["Cookie"] = cookie;
  }

  try {
    const res = await fetch("http://localhost:3000/api/sync/manual-pull", {
      method: "POST",
      headers,
    });

    const data = await res.json();
    
    if (res.ok) {
      console.log(`✅ Sync job enqueued! Job ID: ${data.jobId}`);
      console.log("📊 Check status at: http://localhost:3000/ops\n");
    } else {
      console.error(`❌ Failed: ${res.status} ${JSON.stringify(data)}`);
      if (data.error === "Unauthorized") {
        console.log("\n💡 You need to be logged in. Options:");
        console.log("   1. Open http://localhost:3000/ops and click Sync Now");
        console.log("   2. Run this script with your session cookie:");
        console.log("      node scripts/trigger-sync.js 'your_session_cookie_here'");
      }
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    console.log("\n💡 Make sure the dev server is running: npm run dev");
  }
}

triggerSync();
