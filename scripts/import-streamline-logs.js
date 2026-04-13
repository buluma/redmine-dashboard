#!/usr/bin/env node
/**
 * Streamline Logs Import Script
 * 
 * Imports JSON logs from debugging/logs/ into Supabase database.
 * 
 * Usage:
 *   node scripts/import-streamline-logs.js [options]
 * 
 * Options:
 *   --dry-run        Preview what would be imported without writing to DB
 *   --env <env>      Environment tag (default: staging)
 *   --limit <n>      Max records per log file to import (default: all)
 *   --file <path>    Import specific log file
 *   --help           Show help
 * 
 * Examples:
 *   node scripts/import-streamline-logs.js                    # Import all recent logs
 *   node scripts/import-streamline-logs.js --dry-run          # Preview import
 *   node scripts/import-streamline-logs.js --limit 50         # Limit 50 per file
 *   node scripts/import-streamline-logs.js --file debugging/logs/mbu_logs_xxx.json
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { Decimal } = require('@prisma/client/runtime/library');

const prisma = new PrismaClient();

// Parse CLI args
const args = process.argv.slice(2);
const opts = {
  dryRun: args.includes('--dry-run'),
  env: args.includes('--env') ? args[args.indexOf('--env') + 1] : 'staging',
  limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : null,
  file: args.includes('--file') ? args[args.indexOf('--file') + 1] : null,
  help: args.includes('--help'),
};

if (opts.help) {
  console.log(`
Streamline Logs Import Script

Usage: node scripts/import-streamline-logs.js [options]

Options:
  --dry-run        Preview what would be imported without writing to DB
  --env <env>      Environment tag (default: staging)
  --limit <n>      Max records per log file to import (default: all)
  --file <path>    Import specific log file
  --help           Show help
  `);
  process.exit(0);
}

const LOGS_DIR = path.join(__dirname, '..', 'debugging', 'logs');

// Find log files matching patterns
function findLogFiles() {
  if (opts.file) {
    const fullPath = path.isAbsolute(opts.file) ? opts.file : path.join(process.cwd(), opts.file);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }
    return [fullPath];
  }

  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.endsWith('.json'))
    // Only import the raw log files, not trace files
    .filter(f => /^(mbu_logs|server_side_rules_log|traces)(_errors|_exceptions)?_\d{8}_\d{6}\.json$/.test(f))
    .map(f => path.join(LOGS_DIR, f));

  return files;
}

// Parse a single Ansible JSON log file
function parseLogFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const records = raw.json?.data?.records || [];
  const modelAlias = raw.json?.data?.model_alias || deriveModelAlias(filePath);

  return {
    modelAlias,
    records: records.map(r => {
      // Records are double-encoded JSON strings
      return typeof r === 'string' ? JSON.parse(r) : r;
    }),
  };
}

// Derive model alias from filename when not in JSON
function deriveModelAlias(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.startsWith('mbu_logs')) return 'mbu_logs';
  if (fileName.startsWith('server_side_rules_log')) return 'server_side_rules_log';
  if (fileName.startsWith('traces')) return 'traces';
  return 'unknown';
}

// Transform MBU log record for DB
function transformMbuLog(record, env) {
  return {
    id: BigInt(record.id),
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
    backtrace: record.backtrace || '',
    logLevel: record.log_level || 'TRACE',
    traceType: record.trace_type || 'log',
    traceId: String(record.trace_id || ''),
    code: record.code || '',
    createdBy: record.created_by || null,
    updatedBy: record.updated_by || null,
    environment: env,
  };
}

// Transform Server Side Rules log record for DB
function transformServerSideRulesLog(record, env) {
  return {
    id: BigInt(record.id),
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
    actionName: record.action_name || '',
    status: record.status || 'unknown',
    scriptName: record.script_name || '',
    duration: new Decimal(record.duration || 0),
    ramUsage: parseInt(record.ram_usage, 10) || 0,
    cpuUsage: parseInt(record.cpu_usage, 10) || 0,
    isError: record.is_error || false,
    errorDescr: record.error_descr || null,
    processId: record.process_id || null,
    requestId: record.request_id || null,
    threadId: record.thread_id ? BigInt(record.thread_id) : null,
    dbRequestsTime: record.db_requests_time ? new Decimal(record.db_requests_time) : null,
    coModel: record.co_model || null,
    coRecordId: record.co_record_id || null,
    resType: record.res_type || null,
    environment: env,
  };
}

// Transform Trace log record for DB
function transformTraceLog(record, env) {
  return {
    id: BigInt(record.id),
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
    traceId: BigInt(record.trace_id || record.id),
    traceType: record.trace_type || 'log',
    logLevel: record.log_level || 'INFO',
    backtrace: record.backtrace || '',
    code: record.code || null,
    context: record.context || null,
    resourceId: record.resource_id || null,
    resourceType: record.resource_type || null,
    resourcePath: record.resource_path || null,
    createdBy: record.created_by || null,
    updatedBy: record.updated_by || null,
    environment: env,
  };
}

// Upsert records (skip if already exists by id + environment)
async function upsertRecords(model, records, transformFn, env) {
  let created = 0;
  let skipped = 0;

  for (const record of records) {
    const data = transformFn(record, env);

    try {
      if (opts.dryRun) {
        created++;
        continue;
      }

      await model.upsert({
        where: {
          id_environment: {
            id: data.id,
            environment: env,
          },
        },
        create: data,
        update: data, // Update if exists
      });
      created++;
    } catch (err) {
      if (err.code === 'P2002') {
        skipped++;
      } else {
        console.error(`  ❌ Error upserting record:`, err.message);
      }
    }
  }

  return { created, skipped };
}

async function main() {
  const files = findLogFiles();

  if (files.length === 0) {
    console.log('ℹ️  No log files found to import.');
    console.log(`   Looking in: ${LOGS_DIR}`);
    console.log('   Run the Ansible playbook first to fetch logs.');
    process.exit(0);
  }

  console.log(`📦 Streamline Logs Import Script`);
  console.log(`   Environment: ${opts.env}`);
  console.log(`   Mode: ${opts.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`   Files found: ${files.length}`);
  if (opts.limit) console.log(`   Limit: ${opts.limit} records per file`);
  console.log('');

  const stats = {
    mbuLogs: { created: 0, skipped: 0 },
    serverSideRules: { created: 0, skipped: 0 },
    traces: { created: 0, skipped: 0 },
  };

  for (const file of files) {
    const fileName = path.basename(file);
    console.log(`📄 Processing: ${fileName}`);

    try {
      const { modelAlias, records } = parseLogFile(file);
      const limitedRecords = opts.limit ? records.slice(0, opts.limit) : records;

      console.log(`   Model: ${modelAlias} | Records: ${limitedRecords.length}`);

      switch (modelAlias) {
        case 'mbu_logs': {
          const result = await upsertRecords(
            prisma.mbuLog,
            limitedRecords,
            transformMbuLog,
            opts.env,
          );
          stats.mbuLogs.created += result.created;
          stats.mbuLogs.skipped += result.skipped;
          break;
        }
        case 'server_side_rules_log': {
          const result = await upsertRecords(
            prisma.serverSideRulesLog,
            limitedRecords,
            transformServerSideRulesLog,
            opts.env,
          );
          stats.serverSideRules.created += result.created;
          stats.serverSideRules.skipped += result.skipped;
          break;
        }
        case 'traces': {
          const result = await upsertRecords(
            prisma.trace,
            limitedRecords,
            transformTraceLog,
            opts.env,
          );
          stats.traces.created += result.created;
          stats.traces.skipped += result.skipped;
          break;
        }
        default:
          console.log(`   ⏭️  Skipping unknown model: ${modelAlias}`);
      }
    } catch (err) {
      console.error(`   ❌ Failed to process file: ${err.message}`);
    }
  }

  console.log('');
  console.log('📊 Import Summary:');
  console.log(`   MBU Logs:            ${stats.mbuLogs.created} created, ${stats.mbuLogs.skipped} skipped`);
  console.log(`   Server Side Rules:   ${stats.serverSideRules.created} created, ${stats.serverSideRules.skipped} skipped`);
  console.log(`   Traces:              ${stats.traces.created} created, ${stats.traces.skipped} skipped`);
  console.log(`   ─────────────────────────────────────────`);
  const total = stats.mbuLogs.created + stats.serverSideRules.created + stats.traces.created;
  console.log(`   Total:               ${total} records imported`);
  console.log('');

  if (opts.dryRun) {
    console.log('ℹ️  This was a dry run. No data was written to the database.');
    console.log('   Remove --dry-run to perform the actual import.');
  } else {
    console.log('✅ Import complete!');
  }
}

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
