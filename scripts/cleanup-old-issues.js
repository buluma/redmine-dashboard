#!/usr/bin/env node
/**
 * Cleanup script: Delete issues with startDate older than 3 years.
 * 
 * Usage:
 *   node scripts/cleanup-old-issues.js          # Dry run (preview only)
 *   node scripts/cleanup-old-issues.js --apply   # Actually delete
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes('--apply');
const CUTOFF = new Date();
CUTOFF.setFullYear(CUTOFF.getFullYear() - 3);

async function main() {
  console.log(`🧹 Cleanup: Issues older than 3 years`);
  console.log(`   Cutoff date: ${CUTOFF.toISOString().slice(0, 10)}`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no deletes)' : 'LIVE'}`);
  console.log('');

  // Find issues with startDate before cutoff
  const oldIssues = await prisma.issue.findMany({
    where: {
      startDate: {
        lt: CUTOFF,
      },
    },
    select: {
      id: true,
      redmineIssueId: true,
      subject: true,
      startDate: true,
      projectName: true,
      statusName: true,
    },
    orderBy: {
      startDate: 'asc',
    },
  });

  console.log(`📊 Found ${oldIssues.length} issues with startDate before ${CUTOFF.toISOString().slice(0, 10)}`);
  console.log('');

  if (oldIssues.length === 0) {
    console.log('✅ No old issues to clean up.');
    return;
  }

  // Show preview
  console.log('📋 Preview (first 20):');
  oldIssues.slice(0, 20).forEach((issue) => {
    console.log(
      `   #${issue.redmineIssueId} | ${issue.startDate?.toISOString().slice(0, 10) ?? 'N/A'} | ${issue.projectName ?? '—'} | ${issue.subject.slice(0, 60)}`
    );
  });
  if (oldIssues.length > 20) {
    console.log(`   ... and ${oldIssues.length - 20} more`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('ℹ️  This was a dry run. Run with --apply to delete.');
    return;
  }

  // Delete
  const { count } = await prisma.issue.deleteMany({
    where: {
      startDate: {
        lt: CUTOFF,
      },
    },
  });

  console.log(`🗑️  Deleted ${count} issues.`);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
