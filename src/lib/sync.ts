// Barrel for the Redmine sync pipeline, split across src/lib/sync/* by
// responsibility (parsing, per-issue cache writes, catalogs, breadcrumbs,
// the single-issue orchestrator, and job lifecycle). Re-exports exactly the
// same public surface this file used to define directly, so every existing
// `from "@/src/lib/sync"` import keeps working unchanged.

export { isUnchangedSinceLastSync } from "@/src/lib/sync/parsers";
export { upsertAttachmentsForIssue } from "@/src/lib/sync/issue-cache";
export { syncStatusCatalog, syncEnumerationCatalog } from "@/src/lib/sync/catalog";
export { buildBreadcrumbChain } from "@/src/lib/sync/breadcrumbs";
export { syncSingleIssue } from "@/src/lib/sync/single-issue";
export { runSyncJob, runSyncJobAndWait, executeSyncJob } from "@/src/lib/sync/jobs";
