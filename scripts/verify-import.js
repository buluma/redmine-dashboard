const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const [mbu, ssl, traces] = await Promise.all([
    prisma.mbuLog.count(),
    prisma.serverSideRulesLog.count(),
    prisma.trace.count(),
  ]);

  console.log('📊 Supabase Record Counts:');
  console.log(`   mbu_logs:                ${mbu}`);
  console.log(`   server_side_rules_log:   ${ssl}`);
  console.log(`   traces:                  ${traces}`);
  console.log(`   ─────────────────────────────`);
  console.log(`   Total:                   ${mbu + ssl + traces}`);

  // Show sample records
  console.log('\n📋 Sample MBU Log (latest):');
  const sampleMbu = await prisma.mbuLog.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(`   ID: ${sampleMbu.id} | Level: ${sampleMbu.logLevel} | Message: ${sampleMbu.backtrace?.substring(0, 80)}...`);

  console.log('\n📋 Sample Server Side Rule (latest):');
  const sampleSsl = await prisma.serverSideRulesLog.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(`   ID: ${sampleSsl.id} | Script: ${sampleSsl.scriptName} | Duration: ${sampleSsl.duration}s | Status: ${sampleSsl.status}`);

  console.log('\n📋 Sample Trace (latest):');
  const sampleTrace = await prisma.trace.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log(`   ID: ${sampleTrace.id} | Level: ${sampleTrace.logLevel} | Message: ${sampleTrace.backtrace?.substring(0, 80)}...`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
