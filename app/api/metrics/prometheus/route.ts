import { prisma } from '@/src/lib/db';
import { getMetrics } from '@/src/lib/metrics-store';

function g(name: string, help: string, value: number, labels?: Record<string, string>): string {
  const lStr = labels
    ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
    : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name}${lStr} ${value}\n`;
}

function c(name: string, help: string, value: number, labels?: Record<string, string>): string {
  const lStr = labels
    ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
    : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name}${lStr} ${value}\n`;
}

export async function GET() {
  const proc = getMetrics();

  const [
    userCount,
    issueCount,
    attachmentCount,
    aiSummaryCount,
    aiChatCount,
    syncJobs,
    issuesByStatus,
    issuesByPriority,
    syncStates,
    favoriteCount,
    savedViewCount,
    timeEntryCount,
    webhookSubsActive,
    webhookSubsTotal,
    webhookDeliveries,
    auditLogTotal,
    pushSubTotal,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.issue.count(),
    prisma.issueAttachment.count(),
    prisma.aiSummary.count(),
    prisma.aiChatMessage.count(),
    prisma.syncJob.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.issue.groupBy({ by: ['statusName'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.issue.groupBy({ by: ['priority'], _count: { id: true }, where: { priority: { not: null } } }),
    prisma.syncState.findMany({ select: { lastSyncStatus: true, lastIncrementalSyncAt: true, lastError: true } }),
    prisma.favorite.count(),
    prisma.savedView.count(),
    prisma.timeEntry.count(),
    prisma.webhookSubscription.count({ where: { active: true } }).catch(() => 0),
    prisma.webhookSubscription.count().catch(() => 0),
    prisma.webhookDelivery.groupBy({ by: ['responseStatus'], _count: { id: true } }).catch(() => []),
    prisma.auditLog.count().catch(() => 0),
    prisma.pushSubscription.count().catch(() => 0),
  ]).catch(() => [0, 0, 0, 0, 0, [], [], [], [], 0, 0, 0, 0, 0, [], 0, 0]);

  const lines: string[] = [];

  // Process
  lines.push(g('redmine_uptime_seconds', 'Seconds since the Next.js process started', proc.uptimeSeconds));
  lines.push(c('redmine_http_requests_total', 'Total HTTP requests handled', proc.requests));
  lines.push(c('redmine_http_errors_total', 'Total HTTP errors', proc.errors));

  // DB entity counts
  lines.push(g('redmine_db_users_total', 'Total local users', userCount as number));
  lines.push(g('redmine_db_issues_total', 'Total synced issues', issueCount as number));
  lines.push(g('redmine_db_attachments_total', 'Total issue attachments', attachmentCount as number));
  lines.push(g('redmine_db_ai_summaries_total', 'Total AI summaries generated', aiSummaryCount as number));
  lines.push(g('redmine_db_ai_chat_messages_total', 'Total AI chat messages', aiChatCount as number));
  lines.push(g('redmine_db_favorites_total', 'Total favorited issues', favoriteCount as number));
  lines.push(g('redmine_db_saved_views_total', 'Total saved views', savedViewCount as number));
  lines.push(g('redmine_db_time_entries_total', 'Total time entries', timeEntryCount as number));

  // Sync jobs by status
  lines.push('# HELP redmine_sync_jobs_total Sync jobs by status\n# TYPE redmine_sync_jobs_total gauge');
  for (const row of (syncJobs as { status: string; _count: { id: number } }[])) {
    lines.push(`redmine_sync_jobs_total{status="${row.status}"} ${row._count.id}`);
  }
  lines.push('');

  // Issues by status
  lines.push('# HELP redmine_issues_by_status Issues grouped by Redmine status name\n# TYPE redmine_issues_by_status gauge');
  for (const row of (issuesByStatus as { statusName: string | null; _count: { id: number } }[])) {
    const label = (row.statusName ?? 'unknown').replace(/"/g, "'");
    lines.push(`redmine_issues_by_status{status="${label}"} ${row._count.id}`);
  }
  lines.push('');

  // Issues by priority
  lines.push('# HELP redmine_issues_by_priority Issues grouped by priority\n# TYPE redmine_issues_by_priority gauge');
  for (const row of (issuesByPriority as { priority: string | null; _count: { id: number } }[])) {
    const label = (row.priority ?? 'none').replace(/"/g, "'");
    lines.push(`redmine_issues_by_priority{priority="${label}"} ${row._count.id}`);
  }
  lines.push('');

  // Sync health
  lines.push('# HELP redmine_sync_last_at_seconds Unix timestamp of last incremental sync\n# TYPE redmine_sync_last_at_seconds gauge');
  let syncErrorCount = 0;
  for (const s of (syncStates as { lastSyncStatus: string; lastIncrementalSyncAt: Date | null; lastError: string | null }[])) {
    if (s.lastError) syncErrorCount++;
    if (s.lastIncrementalSyncAt) {
      lines.push(`redmine_sync_last_at_seconds{sync_status="${s.lastSyncStatus}"} ${Math.floor(s.lastIncrementalSyncAt.getTime() / 1000)}`);
    }
  }
  lines.push('');
  lines.push(g('redmine_sync_error_count', 'Number of users with a last sync error', syncErrorCount));

  // Webhooks
  lines.push(g('redmine_webhook_subscriptions_active', 'Active webhook subscriptions', webhookSubsActive as number));
  lines.push(g('redmine_webhook_subscriptions_total', 'Total webhook subscriptions', webhookSubsTotal as number));

  const deliveryRows = (webhookDeliveries as { responseStatus: number | null; _count: { id: number } }[]);
  const deliverySuccess = deliveryRows.filter(r => r.responseStatus !== null && r.responseStatus >= 200 && r.responseStatus < 300).reduce((n, r) => n + r._count.id, 0);
  const deliveryFailed = deliveryRows.filter(r => r.responseStatus === null || r.responseStatus < 200 || r.responseStatus >= 300).reduce((n, r) => n + r._count.id, 0);
  lines.push(c('redmine_webhook_deliveries_success_total', 'Total successful webhook deliveries', deliverySuccess));
  lines.push(c('redmine_webhook_deliveries_failed_total', 'Total failed webhook deliveries', deliveryFailed));

  // Audit & push
  lines.push(g('redmine_audit_log_entries_total', 'Total audit log entries', auditLogTotal as number));
  lines.push(g('redmine_push_subscriptions_total', 'Total active push subscriptions', pushSubTotal as number));

  const body = lines.join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
