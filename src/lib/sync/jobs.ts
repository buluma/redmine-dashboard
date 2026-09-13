// Sync job lifecycle: claim/create a SyncJob row (de-duped against
// concurrent callers), run the incremental/full_manual sync loop over
// listed issues via syncSingleIssue, and record success/failure on both
// SyncJob and SyncState.

import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logEvent } from "@/src/lib/log";
import { RedmineClient } from "@/src/lib/redmine";
import { syncEnumerationCatalog, syncStatusCatalog } from "@/src/lib/sync/catalog";
import { asDate, asNumber, asObject, isUnchangedSinceLastSync } from "@/src/lib/sync/parsers";
import { syncSingleIssue } from "@/src/lib/sync/single-issue";

async function markSyncState(
  userId: string,
  input: {
    status: "idle" | "running" | "success" | "failed";
    runningJobId?: string | null;
    error?: string | null;
    full?: boolean;
    incremental?: boolean;
    // Watermark to stamp for a successful incremental/full run. Must be the
    // time the fetch *started*, not "now" at completion — see syncStartedAt
    // at the executeSyncJob call site. Stamping completion time would let
    // any Redmine update that lands between fetch-start and job-completion
    // fall before the next run's `since` filter and get silently skipped
    // forever (its updated_on is now older than the new watermark).
    syncStartedAt?: Date;
  },
) {
  const now = input.syncStartedAt ?? new Date();
  await prisma.syncState.upsert({
    where: { userId },
    update: {
      lastSyncStatus: input.status,
      runningJobId: input.runningJobId ?? null,
      lastError: input.error ?? null,
      lastFullSyncAt: input.full ? now : undefined,
      lastIncrementalSyncAt: input.incremental ? now : undefined,
    },
    create: {
      userId,
      lastSyncStatus: input.status,
      runningJobId: input.runningJobId ?? null,
      lastError: input.error ?? null,
      lastFullSyncAt: input.full ? now : null,
      lastIncrementalSyncAt: input.incremental ? now : null,
    },
  });
}

/**
 * Finds a reusable pending/running SyncJob for the user, or creates a new
 * pending one. Does not execute it — callers decide whether to fire the
 * execution in the background (runSyncJob) or await it (runSyncJobAndWait).
 */
async function getOrCreateSyncJob(
  userId: string,
  jobType: "incremental" | "full_manual",
): Promise<{ jobId: string; isNew: boolean }> {
  const now = new Date();
  const existing = await prisma.syncJob.findFirst({
    where: {
      userId,
      status: { in: ["pending", "running"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // Only stale-reset "pending" jobs — a "running" job is actively executing,
    // even if it takes longer than the stale threshold.
    if (existing.status === "pending") {
      const ageMs = now.getTime() - existing.createdAt.getTime();
      if (ageMs < env.syncJobStaleMs) {
        logEvent("sync.job.reuse_existing", {
          userId,
          jobType,
          existingJobId: existing.id,
          existingStatus: existing.status,
        });
        return { jobId: existing.id, isNew: false };
      }

      const staleMessage = `Sync job was pending for ${Math.round(ageMs / 1000)}s and was reset automatically`;
      await prisma.syncJob.update({
        where: { id: existing.id },
        data: {
          status: "failed",
          endedAt: now,
          error: staleMessage,
        },
      });

      await markSyncState(userId, {
        status: "failed",
        runningJobId: null,
        error: staleMessage,
        full: false,
        incremental: false,
      });
      logEvent("sync.job.stale_reset", {
        userId,
        staleJobId: existing.id,
        staleAgeMs: ageMs,
        staleMessage,
      }, "warn");
    } else {
      // A "running" job is normally actively executing, but if its process
      // died without updating the row (e.g. container restart mid-sync) it
      // stays "running" forever and blocks every future sync. Treat running
      // jobs past a generous threshold as orphaned and reset them.
      const runningAgeMs = now.getTime() - (existing.startedAt ?? existing.createdAt).getTime();
      if (runningAgeMs < env.syncJobRunningStaleMs) {
        logEvent("sync.job.reuse_existing", {
          userId,
          jobType,
          existingJobId: existing.id,
          existingStatus: existing.status,
        });
        return { jobId: existing.id, isNew: false };
      }

      const orphanMessage = `Sync job was running for ${Math.round(runningAgeMs / 1000)}s without finishing and was reset as orphaned`;
      await prisma.syncJob.update({
        where: { id: existing.id },
        data: {
          status: "failed",
          endedAt: now,
          error: orphanMessage,
        },
      });

      await markSyncState(userId, {
        status: "failed",
        runningJobId: null,
        error: orphanMessage,
        full: false,
        incremental: false,
      });
      logEvent("sync.job.orphan_reset", {
        userId,
        orphanJobId: existing.id,
        orphanAgeMs: runningAgeMs,
        orphanMessage,
      }, "warn");
    }
  }

  // The findFirst above and the create below are two separate round-trips —
  // two near-simultaneous callers for the same user (a double-clicked manual
  // pull, or a manual pull racing a poller tick) can both pass findFirst
  // with no existing job, then both create one, doubling Redmine API load
  // and DB writes concurrently. SyncState.userId is a real unique key (@id),
  // so use a conditional update on it as an atomic claim: only the caller
  // whose update actually matches a row (or wins the create race on a
  // brand-new user) proceeds to create the SyncJob; everyone else falls back
  // to whatever job the winner is about to create.
  const claimed = await prisma.syncState.updateMany({
    where: { userId, lastSyncStatus: { notIn: ["pending", "running"] } },
    data: { lastSyncStatus: "pending" },
  });

  if (claimed.count === 0) {
    const state = await prisma.syncState.findUnique({ where: { userId } });
    if (!state) {
      try {
        await prisma.syncState.create({ data: { userId, lastSyncStatus: "pending" } });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") {
          throw error;
        }
        // Lost the create race too — fall through to the "lost the claim" lookup below.
      }
    }

    // Re-check: either we lost the claim outright, or the create-race branch
    // above also lost. Either way another caller now owns this — find the
    // job it's creating/created instead of inserting a duplicate.
    const stillClaimed = await prisma.syncState.findUnique({ where: { userId } });
    if (stillClaimed && stillClaimed.lastSyncStatus === "pending") {
      const winner = await prisma.syncJob.findFirst({
        where: { userId, status: { in: ["pending", "running"] } },
        orderBy: { createdAt: "desc" },
      });
      if (winner) {
        logEvent("sync.job.claim_lost", { userId, jobType, winnerJobId: winner.id }, "warn");
        return { jobId: winner.id, isNew: false };
      }
      // Extremely narrow window: the winner claimed SyncState but hasn't
      // inserted its SyncJob row yet. Rather than block or loop, fall
      // through and create anyway — worse-case a rare duplicate, which is
      // exactly today's behavior, not a regression.
    }
  }

  const job = await prisma.syncJob.create({
    data: {
      userId,
      jobType,
      status: "pending",
    },
  });

  logEvent("sync.job.created", { userId, jobType, jobId: job.id });
  return { jobId: job.id, isNew: true };
}

/**
 * Enqueues a sync job and returns immediately — the actual sync runs in the
 * background. Used by callers (manual pull, bootstrap, connect) that just
 * need a jobId to poll status on, and shouldn't block on the sync itself.
 */
export async function runSyncJob(
  userId: string,
  jobType: "incremental" | "full_manual",
): Promise<{ jobId: string }> {
  const { jobId, isNew } = await getOrCreateSyncJob(userId, jobType);
  if (isNew) {
    void executeSyncJob(jobId);
  }
  return { jobId };
}

/**
 * Like runSyncJob, but awaits the actual sync execution before returning.
 * The poller needs this: it counts issue.created/issue.updated events across
 * the run to size sync.tick.completed (see poller.ts), which requires the
 * sync to have actually finished — not merely been enqueued — before the
 * counter unsubscribes. Using fire-and-forget runSyncJob here previously
 * caused sync.tick.completed to fire almost immediately with near-zero
 * counts while the real sync was still running in the background.
 */
export async function runSyncJobAndWait(
  userId: string,
  jobType: "incremental" | "full_manual",
): Promise<{ jobId: string }> {
  const { jobId, isNew } = await getOrCreateSyncJob(userId, jobType);
  if (isNew) {
    await executeSyncJob(jobId);
  } else {
    // Reused an existing pending/running job (e.g. a manual pull already in
    // flight for this user) — wait for it to leave pending/running instead
    // of assuming it's done, so the caller still gets a real completion.
    await waitForSyncJobToSettle(jobId);
  }
  return { jobId };
}

async function waitForSyncJobToSettle(jobId: string): Promise<void> {
  const pollMs = 500;
  const maxWaitMs = env.syncJobRunningStaleMs;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const job = await prisma.syncJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || job.status === "success" || job.status === "failed") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  logEvent("sync.job.wait_timeout", { jobId }, "warn");
}

export async function executeSyncJob(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") {
    return;
  }

  await prisma.syncJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: new Date(),
    },
  });

  await markSyncState(job.userId, { status: "running", runningJobId: jobId, error: null });
  logEvent("sync.job.started", {
    jobId,
    userId: job.userId,
    jobType: job.jobType,
  });

  try {
    const cred = await prisma.userRedmineCredential.findUnique({ where: { userId: job.userId } });
    if (!cred || !cred.isActive) {
      throw new Error("User has no active Redmine credential");
    }

    const { decryptText } = await import("@/src/lib/crypto");
    const client = new RedmineClient(cred.baseUrl, decryptText(cred.apiKeyEncrypted, cred.apiKeyIv));

    await syncStatusCatalog(client);
    await syncEnumerationCatalog(client);

    const syncState = await prisma.syncState.findUnique({ where: { userId: job.userId } });

    // Determine the date filter for fetching issues:
    // - incremental: uses lastIncrementalSyncAt from SyncState
    // - full_manual: fetches only issues updated in the last 24 hours
    //   to avoid expensive full-table scans on large Redmine instances
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const incrementalSince =
      job.jobType === "incremental"
        ? (syncState?.lastIncrementalSyncAt ?? undefined)
        : job.jobType === "full_manual"
          ? twentyFourHoursAgo
          : undefined;

    // Captured before the fetch, not after — see markSyncState's
    // syncStartedAt doc comment.
    const syncStartedAt = new Date();
    const issueList = await client.listIssues(env.redmineSyncIssueScope, incrementalSince);
    const seenRemoteIssueIds = new Set<number>();

    // redmineDate() (redmine.ts) filters `updated_on` at day granularity, not
    // timestamp granularity — every incremental tick re-lists every issue
    // touched *today*, not just since the last poll. syncSingleIssue does a
    // full detail GET plus several upserts per issue, so on a busy project
    // that's real amplification, worse as the day goes on. Compare each
    // listed issue's updated_on against what's already cached and skip the
    // ones that plainly haven't changed since we last synced them. Only for
    // incremental — full_manual intentionally re-walks everything to also
    // prune stale time entries/attachments/relations (pruneTimeEntries etc.
    // below), which this shortcut would defeat.
    let cachedUpdatedOnByRemoteId: Map<number, Date> | null = null;
    if (job.jobType === "incremental") {
      const remoteIds = issueList
        .map((raw) => asNumber(asObject(raw).id))
        .filter((id): id is number => id != null);
      const cached = remoteIds.length > 0
        ? await prisma.issue.findMany({
            where: { userId: job.userId, redmineBaseUrl: client.normalizedBaseUrl, redmineIssueId: { in: remoteIds } },
            select: { redmineIssueId: true, updatedOnRemote: true },
          })
        : [];
      cachedUpdatedOnByRemoteId = new Map(
        cached
          .filter((c): c is typeof c & { redmineIssueId: number } => c.redmineIssueId != null)
          .map((c) => [c.redmineIssueId, c.updatedOnRemote])
      );
    }

    // One issue's failure (a persistent 429/timeout after RedmineClient's own
    // retries, a malformed payload) used to propagate straight out of this
    // loop and abort the whole job — every issue after the failing one in
    // this page simply never synced that run, with seenRemoteIssueIds so far
    // discarded. Isolate each issue instead: log it, keep going, and let the
    // job still complete for everything that did sync — a single bad issue
    // will just retry on the next tick along with everything else.
    const failedRemoteIssueIds: number[] = [];

    for (const issueRaw of issueList) {
      const remoteId = asNumber(asObject(issueRaw).id);
      if (!remoteId) {
        continue;
      }
      seenRemoteIssueIds.add(remoteId);

      if (
        cachedUpdatedOnByRemoteId &&
        isUnchangedSinceLastSync(asDate(asObject(issueRaw).updated_on), cachedUpdatedOnByRemoteId.get(remoteId))
      ) {
        continue;
      }

      try {
        await syncSingleIssue(job.userId, client, remoteId, {
          pruneTimeEntries: job.jobType === "full_manual",
          pruneAttachments: true,
          pruneRelations: true,
          sendNotifications: env.slackNotifyEnabled,
        });
      } catch (error) {
        failedRemoteIssueIds.push(remoteId);
        logEvent("sync.job.issue_failed", { userId: job.userId, jobId, remoteIssueId: remoteId, error }, "warn");
      }
    }

    // The "assigned" scope's Redmine query is assigned_to_id=me, so an issue
    // reassigned away from the user simply stops matching and drops out of
    // every future scoped fetch above — its cached assignee would otherwise
    // stick forever. Re-check, by explicit id with no assigned_to filter,
    // any issue our cache still believes is assigned to the user but that
    // this tick's scoped fetch didn't see. Self-limiting: once corrected,
    // the issue's cached assignee no longer matches "me" and it drops out
    // of this set on its own.
    if (env.redmineSyncIssueScope === "assigned") {
      try {
        const me = await client.getCurrentUser();
        const cachedMine = await prisma.issue.findMany({
          where: {
            userId: job.userId,
            source: "redmine",
            redmineBaseUrl: client.normalizedBaseUrl,
            assignedToId: me.id,
            redmineIssueId: { not: null },
          },
          select: { redmineIssueId: true },
        });
        const missingIds = cachedMine
          .map((i) => i.redmineIssueId)
          .filter((id): id is number => id != null && !seenRemoteIssueIds.has(id));

        if (missingIds.length > 0) {
          const recheckList = await client.listIssuesByIds(missingIds);
          for (const issueRaw of recheckList) {
            const remoteId = asNumber(asObject(issueRaw).id);
            if (!remoteId || seenRemoteIssueIds.has(remoteId)) {
              continue;
            }
            seenRemoteIssueIds.add(remoteId);
            try {
              await syncSingleIssue(job.userId, client, remoteId, {
                pruneTimeEntries: job.jobType === "full_manual",
                pruneAttachments: true,
                pruneRelations: true,
                sendNotifications: env.slackNotifyEnabled,
              });
            } catch (error) {
              failedRemoteIssueIds.push(remoteId);
              logEvent("sync.job.issue_failed", { userId: job.userId, jobId, remoteIssueId: remoteId, error }, "warn");
            }
          }
          logEvent("sync.job.recheck_reassigned", {
            userId: job.userId,
            jobId,
            checkedCount: missingIds.length,
            foundCount: recheckList.length,
          });
        }
      } catch (error) {
        // Non-fatal: the main scoped sync above already succeeded. Losing
        // this pass just means reassignment detection reverts to waiting
        // for the next full_manual pull, not a failed sync job.
        logEvent("sync.job.recheck_failed", { userId: job.userId, jobId, error }, "warn");
      }
    }

    // SAFETY: Do NOT delete issues that weren't seen during sync.
    // The sync may not fetch ALL issues (pagination limits, rate limiting,
    // interrupted jobs, or scoped queries like assigned/open).
    // Deleting unseen issues would cause data loss.
    // if (job.jobType === "full_manual") {
    //   await prisma.issue.deleteMany({
    //     where: {
    //       userId: job.userId,
    //       redmineBaseUrl: client.normalizedBaseUrl,
    //       redmineIssueId: { notIn: Array.from(seenRemoteIssueIds) },
    //     },
    //   });
    // }

    // A per-issue failure above doesn't fail the whole job — everything that
    // did sync is real and shouldn't be thrown away — but it also shouldn't
    // be invisible. Surface it as a non-fatal note on the otherwise-"success"
    // job/state rows instead of silently discarding it.
    const partialFailureNote = failedRemoteIssueIds.length > 0
      ? `${failedRemoteIssueIds.length} issue(s) failed to sync this run: ${failedRemoteIssueIds.join(", ")}`
      : null;

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        endedAt: new Date(),
        error: partialFailureNote,
      },
    });

    await markSyncState(job.userId, {
      status: "success",
      runningJobId: null,
      error: partialFailureNote,
      full: job.jobType === "full_manual",
      incremental: job.jobType === "incremental",
      syncStartedAt,
    });
    logEvent("sync.job.succeeded", {
      jobId,
      userId: job.userId,
      jobType: job.jobType,
      syncedIssueCount: seenRemoteIssueIds.size,
      failedIssueCount: failedRemoteIssueIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        endedAt: new Date(),
        error: message,
      },
    });

    await markSyncState(job.userId, {
      status: "failed",
      runningJobId: null,
      error: message,
      full: false,
      incremental: false,
    });
    logEvent("sync.job.failed", {
      jobId,
      userId: job.userId,
      jobType: job.jobType,
      error: message,
    }, "error");
  }
}
