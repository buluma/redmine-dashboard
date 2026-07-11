/**
 * Streamline Logs Import Library
 *
 * Reusable import functions used by both the CLI script
 * and the Heimdall refresh API route.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'debugging', 'logs');

// Default hosts per environment (can be overridden via options)
const DEFAULT_HOSTS: Record<string, string> = {
  staging: 'streamline.staging.vodacomsa-battery.nasctech.com',
  production: 'streamline.vodacomsa-battery.nasctech.com',
};

function extractHostFromEnv(env: string): string {
  return DEFAULT_HOSTS[env] || `${env}.example.com`;
}

export type ImportResult = {
  mbuLogs: { created: number; skipped: number };
  serverSideRules: { created: number; skipped: number };
  traces: { created: number; skipped: number };
  filesProcessed: number;
  totalRecords: number;
  errors: string[];
};

// Derive model alias from filename when not in JSON
function deriveModelAlias(filePath: string): string {
  const fileName = path.basename(filePath);
  if (fileName.startsWith('mbu_logs')) return 'mbu_logs';
  if (fileName.startsWith('server_side_rules_log')) return 'server_side_rules_log';
  if (fileName.startsWith('traces')) return 'traces';
  return 'unknown';
}

// Find log files matching patterns
function findLogFiles(): string[] {
  if (!fs.existsSync(LOGS_DIR)) return [];

  return fs.readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => /^(mbu_logs|server_side_rules_log|traces)(_errors|_exceptions)?_\d{8}_\d{6}\.json$/.test(f))
    .map((f) => path.join(LOGS_DIR, f));
}

// Parse a single Ansible JSON log file
function parseLogFile(filePath: string): { modelAlias: string; records: Record<string, unknown>[] } {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const records = raw.json?.data?.records || [];
  const modelAlias = raw.json?.data?.model_alias || deriveModelAlias(filePath);

  return {
    modelAlias,
    records: records.map((r: unknown) => (typeof r === 'string' ? JSON.parse(r) : r)),
  };
}

// Transform MBU log record for DB
function transformMbuLog(record: Record<string, unknown>, env: string, host: string) {
  return {
    id: BigInt(record.id as string | number),
    createdAt: new Date(record.created_at as string),
    updatedAt: new Date(record.updated_at as string),
    backtrace: (record.backtrace as string) || '',
    logLevel: (record.log_level as string) || 'TRACE',
    traceType: (record.trace_type as string) || 'log',
    traceId: String(record.trace_id || ''),
    code: (record.code as string) || '',
    host,
    createdBy: record.created_by ? Number(record.created_by) : null,
    updatedBy: record.updated_by ? Number(record.updated_by) : null,
    environment: env,
  };
}

// Transform Server Side Rules log record for DB
function transformServerSideRulesLog(record: Record<string, unknown>, env: string, host: string) {
  return {
    id: BigInt(record.id as string | number),
    createdAt: new Date(record.created_at as string),
    updatedAt: new Date(record.updated_at as string),
    actionName: (record.action_name as string) || '',
    status: (record.status as string) || 'unknown',
    scriptName: (record.script_name as string) || '',
    duration: new Prisma.Decimal(Number(record.duration ?? 0)),
    ramUsage: parseInt(record.ram_usage as string, 10) || 0,
    cpuUsage: parseInt(record.cpu_usage as string, 10) || 0,
    host,
    isError: Boolean(record.is_error) || /error|fail/i.test(String(record.status ?? "")),
    errorDescr: (record.error_descr as string) || null,
    processId: record.process_id ? Number(record.process_id) : null,
    requestId: (record.request_id as string) || null,
    threadId: record.thread_id ? BigInt(record.thread_id as string | number) : null,
    dbRequestsTime: record.db_requests_time != null
      ? new Prisma.Decimal(Number(record.db_requests_time))
      : null,
    coModel: (record.co_model as string) || null,
    coRecordId: record.co_record_id ? Number(record.co_record_id) : null,
    resType: (record.res_type as string) || null,
    environment: env,
  };
}

// Transform Trace log record for DB
function transformTraceLog(record: Record<string, unknown>, env: string, host: string) {
  return {
    id: BigInt(record.id as string | number),
    createdAt: new Date(record.created_at as string),
    updatedAt: new Date(record.updated_at as string),
    traceId: BigInt((record.trace_id ?? record.id) as string | number),
    traceType: (record.trace_type as string) || 'log',
    logLevel: (record.log_level as string) || 'INFO',
    backtrace: (record.backtrace as string) || '',
    code: (record.code as string) || null,
    context: (record.context as string) || null,
    host,
    resourceId: record.resource_id ? Number(record.resource_id) : null,
    resourceType: (record.resource_type as string) || null,
    resourcePath: (record.resource_path as string) || null,
    createdBy: record.created_by ? Number(record.created_by) : null,
    updatedBy: record.updated_by ? Number(record.updated_by) : null,
    environment: env,
  };
}

// Upsert a single MBU log record
export async function upsertMbuLog(
  prisma: PrismaClient,
  record: Record<string, unknown>,
  env: string,
  host: string,
): Promise<{ created: boolean }> {
  const data = transformMbuLog(record, env, host);
  try {
    await prisma.mbuLog.upsert({
      where: {
        id_environment_host: {
          id: data.id,
          environment: env,
          host,
        },
      },
      create: data,
      update: data,
    });
    return { created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { created: false };
    }
    throw err;
  }
}

// Upsert a single Server Side Rules log record
export async function upsertServerSideRulesLog(
  prisma: PrismaClient,
  record: Record<string, unknown>,
  env: string,
  host: string,
): Promise<{ created: boolean }> {
  const data = transformServerSideRulesLog(record, env, host);
  try {
    await prisma.serverSideRulesLog.upsert({
      where: {
        id_environment_host: {
          id: data.id,
          environment: env,
          host,
        },
      },
      create: data,
      update: data,
    });
    return { created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { created: false };
    }
    throw err;
  }
}

// Upsert a single Trace record
export async function upsertTrace(
  prisma: PrismaClient,
  record: Record<string, unknown>,
  env: string,
  host: string,
): Promise<{ created: boolean }> {
  const data = transformTraceLog(record, env, host);
  try {
    await prisma.trace.upsert({
      where: {
        id_environment_host: {
          id: data.id,
          environment: env,
          host,
        },
      },
      create: data,
      update: data,
    });
    return { created: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { created: false };
    }
    throw err;
  }
}

// Prisma's generated per-model upsert() signatures are structurally
// incompatible with each other (each model's WhereUniqueInput union
// requires a different set of alternate keys), so this can't be typed
// against the real delegate shape without a generic per-call-site cast.
// Record<string, unknown> args is the practical common denominator —
// the actual where/create/update objects are still fully typed at each
// call site below, this just describes what upsertRecords needs to call.
interface UpsertableModel {
  upsert(args: Record<string, unknown>): Promise<unknown>;
}

// Upsert records (skip if already exists by id + environment + host)
async function upsertRecords(
  model: UpsertableModel,
  records: Record<string, unknown>[],
  transformFn: (r: Record<string, unknown>, env: string, host: string) => Record<string, unknown>,
  env: string,
  host: string,
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const record of records) {
    const data = transformFn(record, env, host);

    try {
      await model.upsert({
        where: {
          id_environment_host: {
            id: data.id,
            environment: env,
            host,
          },
        },
        create: data,
        update: data,
      });
      created++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  return { created, skipped };
}

/**
 * Fetch logs directly from Streamline API.
 * Returns raw records from the API for each log type.
 */
export async function fetchStreamlineLogsFromAPI(
  options: { environment?: string; limit?: number } = {},
): Promise<{ mbuLogs: Record<string, unknown>[]; serverSideRules: Record<string, unknown>[]; traces: Record<string, unknown>[]; errors: string[]; host: string }> {
  const env = options.environment || 'staging';
  const limit = options.limit || 100;
  const host = extractHostFromEnv(env);
  
  const result = {
    mbuLogs: [] as Record<string, unknown>[],
    serverSideRules: [] as Record<string, unknown>[],
    traces: [] as Record<string, unknown>[],
    errors: [] as string[],
    host,
  };

  // Get token from environment
  const token = process.env.STREAMLINE_TOKEN;
  if (!token) {
    result.errors.push('STREAMLINE_TOKEN not configured in environment');
    return result;
  }

  const apiBase = `https://${host}`;
  
  // Model aliases to fetch
  const modelAliases = [
    { alias: 'mbu_logs', key: 'mbuLogs' },
    { alias: 'server_side_rules_log', key: 'serverSideRules' },
    { alias: 'traces', key: 'traces' },
  ];

  for (const model of modelAliases) {
    try {
      const url = `${apiBase}/api/v1/custom_objects/rest_test/get_all?token=${token}&model_alias=${model.alias}&order_by=id&order=DESC&limit=${limit}`;
      const res = await fetch(url, { method: 'GET' });
      
      if (!res.ok) {
        result.errors.push(`HTTP ${res.status} from ${model.alias}`);
        continue;
      }
      
      const data = await res.json();
      const records = data?.data?.records || [];
      
      if (Array.isArray(records)) {
        // Parse each record (they come as JSON strings)
        const parsed: Record<string, unknown>[] = records.map((r: unknown) => {
          if (typeof r === 'string') {
            try {
              return JSON.parse(r);
            } catch {
              return { raw: r };
            }
          }
          return r as Record<string, unknown>;
        });
        if (model.key === 'mbuLogs') result.mbuLogs = parsed;
        else if (model.key === 'serverSideRules') result.serverSideRules = parsed;
        else if (model.key === 'traces') result.traces = parsed;
      }
    } catch (err) {
      result.errors.push(`Failed to fetch ${model.alias}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If API didn't work, fall back to local files
  if (result.mbuLogs.length === 0 && result.traces.length === 0) {
    result.errors.push('API fetch failed, no records returned');
  }

  return result;
}

/**
 * Import all available log files from debugging/logs/ into Supabase.
 * Uses upsert so existing records (by id + environment + host) are skipped.
 */
export async function importStreamlineLogs(
  prisma: PrismaClient,
  options: { environment?: string; logFile?: string; limit?: number; host?: string } = {},
): Promise<ImportResult> {
  const env = options.environment || 'staging';
  const host = options.host || extractHostFromEnv(env);
  const result: ImportResult = {
    mbuLogs: { created: 0, skipped: 0 },
    serverSideRules: { created: 0, skipped: 0 },
    traces: { created: 0, skipped: 0 },
    filesProcessed: 0,
    totalRecords: 0,
    errors: [],
  };

  const files = options.logFile
    ? [path.isAbsolute(options.logFile) ? options.logFile : path.join(process.cwd(), options.logFile)]
    : findLogFiles();

  if (files.length === 0) {
    result.errors.push('No log files found in debugging/logs/. Run the Ansible playbook first.');
    return result;
  }

  for (const file of files) {
    try {
      const { modelAlias, records } = parseLogFile(file);
      if (records.length === 0) continue;

      // Apply guard limit: only process the last N records
      const limitedRecords = options.limit
        ? records.slice(-options.limit)
        : records;

      result.filesProcessed++;
      result.totalRecords += limitedRecords.length;

      switch (modelAlias) {
        case 'mbu_logs': {
          const r = await upsertRecords(prisma.mbuLog, limitedRecords, transformMbuLog, env, host);
          result.mbuLogs.created += r.created;
          result.mbuLogs.skipped += r.skipped;
          break;
        }
        case 'server_side_rules_log': {
          const r = await upsertRecords(prisma.serverSideRulesLog, limitedRecords, transformServerSideRulesLog, env, host);
          result.serverSideRules.created += r.created;
          result.serverSideRules.skipped += r.skipped;
          break;
        }
        case 'traces': {
          const r = await upsertRecords(prisma.trace, limitedRecords, transformTraceLog, env, host);
          result.traces.created += r.created;
          result.traces.skipped += r.skipped;
          break;
        }
        default:
          // skip unknown models
          break;
      }
    } catch (err) {
      result.errors.push(`Failed to process ${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Import logs fetched directly from Streamline API into Supabase.
 * Uses the fetchStreamlineLogsFromAPI function first, then imports results.
 */
export async function importStreamlineLogsFromAPI(
  prisma: PrismaClient,
  options: { environment?: string; limit?: number } = {},
): Promise<ImportResult> {
  const env = options.environment || 'staging';
  const limit = options.limit || 100;
  const host = extractHostFromEnv(env);

  const result: ImportResult = {
    mbuLogs: { created: 0, skipped: 0 },
    serverSideRules: { created: 0, skipped: 0 },
    traces: { created: 0, skipped: 0 },
    filesProcessed: 0,
    totalRecords: 0,
    errors: [],
  };

  // Fetch from API
  const apiResult = await fetchStreamlineLogsFromAPI({ environment: env, limit });
  result.errors = apiResult.errors;

  // Import each record type
  if (apiResult.mbuLogs.length > 0) {
    const r = await upsertRecords(prisma.mbuLog, apiResult.mbuLogs, transformMbuLog, env, host);
    result.mbuLogs.created = r.created;
    result.mbuLogs.skipped = r.skipped;
    result.filesProcessed++;
    result.totalRecords += apiResult.mbuLogs.length;
  }

  if (apiResult.serverSideRules.length > 0) {
    const r = await upsertRecords(prisma.serverSideRulesLog, apiResult.serverSideRules, transformServerSideRulesLog, env, host);
    result.serverSideRules.created = r.created;
    result.serverSideRules.skipped = r.skipped;
    result.filesProcessed++;
    result.totalRecords += apiResult.serverSideRules.length;
  }

  if (apiResult.traces.length > 0) {
    const r = await upsertRecords(prisma.trace, apiResult.traces, transformTraceLog, env, host);
    result.traces.created = r.created;
    result.traces.skipped = r.skipped;
    result.filesProcessed++;
    result.totalRecords += apiResult.traces.length;
  }

  return result;
}
