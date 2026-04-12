require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const total = await prisma.issue.count();
  const withParent = await prisma.issue.count({ where: { parentIssueId: { not: null } } });
  const withoutParent = total - withParent;

  console.log(`📊 Supabase Issue Table`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total issues:          ${total.toLocaleString()}`);
  console.log(`  With parent:         ${withParent.toLocaleString()}`);
  console.log(`  Without parent:      ${withoutParent.toLocaleString()}`);

  // Count by user
  const byUser = await prisma.issue.groupBy({
    by: ['userId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log(`\n👥 Issues per user:`);
  for (const row of byUser) {
    console.log(`  ${row.userId.substring(0, 8)}...  ${row._count.id.toLocaleString()}`);
  }

  await prisma.$disconnect();
})();
