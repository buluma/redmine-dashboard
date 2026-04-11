#!/usr/bin/env node
/**
 * Sync Redmine enumerations (priorities, activities, etc.) into the local database.
 */

require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REDMINE_BASE_URL = process.env.REDMINE_BASE_URL;
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;

async function fetchEnumerations(kind, endpoint) {
  console.log(`🔍 Fetching ${kind} from Redmine...`);
  const res = await fetch(`${REDMINE_BASE_URL}/enumerations/${endpoint}.json?key=${REDMINE_API_KEY}`);
  if (!res.ok) {
    console.error(`   ❌ Failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  const items = data[endpoint] || data[`${endpoint}s`] || [];
  console.log(`   ✅ Found ${items.length} ${kind}`);
  return items;
}

async function syncEnumerations() {
  if (!REDMINE_BASE_URL || !REDMINE_API_KEY) {
    console.error("❌ Missing REDMINE_BASE_URL or REDMINE_API_KEY in .env");
    process.exit(1);
  }

  console.log(`🔗 Redmine: ${REDMINE_BASE_URL}\n`);

  const kinds = [
    { kind: "issue_priority", endpoint: "issue_priorities" },
    { kind: "time_entry_activity", endpoint: "time_entry_activities" },
    { kind: "document_category", endpoint: "document_categories" },
  ];

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const { kind, endpoint } of kinds) {
    const items = await fetchEnumerations(kind, endpoint);
    if (items.length === 0) continue;

    for (const item of items) {
      try {
        const existing = await prisma.redmineEnumeration.findUnique({
          where: { id: item.id },
        });

        if (existing) {
          await prisma.redmineEnumeration.update({
            where: { id: item.id },
            data: {
              name: item.name,
              isDefault: item.is_default ?? false,
              isActive: item.is_active ?? item.active ?? true,
              position: item.position ?? null,
              lastSeenAt: new Date(),
            },
          });
          totalUpdated++;
        } else {
          await prisma.redmineEnumeration.create({
            data: {
              id: item.id,
              kind,
              name: item.name,
              isDefault: item.is_default ?? false,
              isActive: item.is_active ?? item.active ?? true,
              position: item.position ?? null,
            },
          });
          totalCreated++;
        }
      } catch (err) {
        console.error(`   ⚠️  Failed to upsert ${kind} #${item.id}: ${err.message}`);
      }
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   Created: ${totalCreated}`);
  console.log(`   Updated: ${totalUpdated}`);

  // List priorities
  const priorities = await prisma.redmineEnumeration.findMany({
    where: { kind: "issue_priority", isActive: true },
    orderBy: { position: "asc" },
  });

  console.log(`\n🎯 Issue Priorities (${priorities.length}):`);
  for (const p of priorities) {
    const marker = p.isDefault ? " ⭐" : "";
    console.log(`   #${p.id}: ${p.name}${marker} (pos: ${p.position ?? "-"})`);
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

syncEnumerations().catch((err) => {
  console.error(`💥 Fatal error: ${err.message}`);
  process.exit(1);
});
