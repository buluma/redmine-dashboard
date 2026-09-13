import { prisma } from "@/src/lib/db";
import { recordIssueActivityEvent, recomputeIssueActivityIndex } from "@/src/lib/activity-index";
import type { RedmineClient } from "@/src/lib/redmine";

type WakaBreakdown = { name: string; total_seconds: number; percent: number; text: string };

type TicketMatch = {
  ticket: {
    id: string;
    localIssueNumber: number | null;
    subject: string;
    projectName: string | null;
    spentHours: number | null;
  };
  link: {
    id: string;
    repositoryFullName: string;
    url: string;
  };
};

// An already-written TimeEntry for a given issue+day, as needed to decide
// whether that day's total has grown since it was logged and, if so, how to
// correct it (local-only update vs. a real Redmine PUT).
export type ExistingWakaEntry = { id: string; hours: number; redmineTimeEntryId: number | null };

export type CorrelationRow = {
  ticketId: string;
  localIssueNumber: number | null;
  subject: string;
  repo: string;
  totalSeconds: number;
  perDay: Array<{ date: string; seconds: number }>;
  alreadyLoggedDates: string[];
  existingEntriesByDate: Record<string, ExistingWakaEntry>;
};

type UnmatchedProject = {
  project: string;
  totalSeconds: number;
  perDay: Array<{ date: string; seconds: number }>;
};

export type CorrelationResult = {
  matched: CorrelationRow[];
  unmatched: UnmatchedProject[];
};

export type ApplyResult = {
  created: number;
  updated: number;
  skipped: number;
  totalHours: number;
  entries: Array<{ ticketId: string; date: string; hours: number }>;
  updateFailures: Array<{ ticketId: string; date: string; error: string }>;
};

/**
 * Reads AUTO_CREATE_UNMATCHED_TICKETS / AUTO_CREATE_TICKET_THRESHOLD_SECONDS /
 * GITHUB_DEFAULT_OWNER from the environment. Returns undefined when the
 * feature is disabled, so callers can pass the result straight through as
 * applyTimeEntries's `autoCreate` option.
 */
export function getAutoCreateOptionsFromEnv(): { thresholdSeconds: number; defaultOwner: string } | undefined {
  const enabled = (process.env.AUTO_CREATE_UNMATCHED_TICKETS ?? "true").trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(enabled)) return undefined;

  const thresholdSeconds = Number(process.env.AUTO_CREATE_TICKET_THRESHOLD_SECONDS ?? 7200);
  const defaultOwner = process.env.GITHUB_DEFAULT_OWNER;
  if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0 || !defaultOwner) return undefined;

  return { thresholdSeconds, defaultOwner };
}

/**
 * Normalize a project or repo name for matching.
 * For "owner/repo" format, extracts the repo segment.
 * Lowercases and strips non-alphanumeric characters.
 */
export function normalizeProjectName(name: string | null | undefined): string {
  if (!name) return "";
  // Extract repo segment from "owner/repo"
  const parts = name.split("/");
  const segment = parts.length > 1 ? parts[parts.length - 1] : name;
  return segment.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Build an index mapping normalized repo names to their local tickets.
 * Only indexes local issues (source="local") that have at least one github link.
 */
export async function buildProjectTicketIndex(
  userId: string
): Promise<Map<string, TicketMatch>> {
  const issues = await prisma.issue.findMany({
    where: { userId, source: "local" },
    // Deterministic order so an ambiguous substring match (see findMatch)
    // resolves the same way on every run instead of depending on DB order.
    orderBy: { id: "asc" },
    select: {
      id: true,
      localIssueNumber: true,
      subject: true,
      projectName: true,
      spentHours: true,
      githubLinks: {
        select: { id: true, repositoryFullName: true, url: true },
      },
    },
  });

  const index = new Map<string, TicketMatch>();

  for (const issue of issues) {
    for (const link of issue.githubLinks) {
      const normalized = normalizeProjectName(link.repositoryFullName);
      if (normalized) {
        index.set(normalized, {
          ticket: {
            id: issue.id,
            localIssueNumber: issue.localIssueNumber,
            subject: issue.subject,
            projectName: issue.projectName,
            spentHours: issue.spentHours,
          },
          link: {
            id: link.id,
            repositoryFullName: link.repositoryFullName,
            url: link.url,
          },
        });
      }
    }
  }

  return index;
}

// Below this length, a bidirectional substring match is too likely to be a
// coincidence ("api" inside "rapidapi", "sl2" inside "sl2platformx") rather
// than a real relationship — those short names must match exactly instead.
const MIN_SUBSTRING_MATCH_LENGTH = 4;

/**
 * Find a ticket match for a WakaTime project name.
 * Strategy: exact normalized match first, then bidirectional substring —
 * restricted to names long enough (see MIN_SUBSTRING_MATCH_LENGTH) that a
 * false-positive collision is unlikely, and picking the most specific
 * (longest) shared substring when more than one repo could match, so the
 * result is deterministic regardless of index iteration order.
 */
function findMatch(
  wakaProjectName: string,
  index: Map<string, TicketMatch>
): TicketMatch | null {
  const normalizedWaka = normalizeProjectName(wakaProjectName);
  if (!normalizedWaka) return null;

  // Exact normalized match
  const exact = index.get(normalizedWaka);
  if (exact) return exact;

  // Bidirectional substring match, most-specific (longest) match wins
  let best: { match: TicketMatch; repoNorm: string; specificity: number } | null = null;
  for (const [repoNorm, match] of index.entries()) {
    const shorter = normalizedWaka.length <= repoNorm.length ? normalizedWaka : repoNorm;
    const longer = normalizedWaka.length <= repoNorm.length ? repoNorm : normalizedWaka;
    if (shorter.length < MIN_SUBSTRING_MATCH_LENGTH) continue;
    if (!longer.includes(shorter)) continue;

    if (
      !best ||
      shorter.length > best.specificity ||
      (shorter.length === best.specificity && repoNorm < best.repoNorm)
    ) {
      best = { match, repoNorm, specificity: shorter.length };
    }
  }

  return best?.match ?? null;
}

/**
 * Look up the configured catch-all ("Misc / Unlinked") ticket, if any.
 * Returns null when no id is configured, or when the id doesn't resolve to
 * a real local ticket owned by this user (deleted, wrong user, typo'd env
 * var) — callers fall back to normal unmatched behaviour in that case
 * rather than silently misrouting time to someone else's ticket.
 */
async function getCatchAllTicket(
  userId: string,
  catchAllIssueId: string | undefined
): Promise<TicketMatch["ticket"] | null> {
  if (!catchAllIssueId) return null;
  return prisma.issue.findFirst({
    where: { id: catchAllIssueId, userId, source: "local" },
    select: { id: true, localIssueNumber: true, subject: true, projectName: true, spentHours: true },
  });
}

/**
 * Correlate WakaTime daily summaries with personal tickets for a date range.
 *
 * `catchAllIssueId`, when it resolves to a real local ticket, is the last
 * resort for any project findMatch() can't place: rather than piling up
 * forever in `unmatched` (and re-triggering the same "unmatched activity"
 * alert every sync with no way to clear it — see sync-timelogs.sh), those
 * hours get logged against this one ticket instead, with the original
 * WakaTime project name preserved as the `repo` label so they're still
 * traceable back to their source later. A real match always wins over the
 * catch-all — this only fires when findMatch() truly finds nothing.
 */
export async function correlateWakaTime(
  userId: string,
  options: { start: string; end: string; catchAllIssueId?: string }
): Promise<CorrelationResult> {
  const index = await buildProjectTicketIndex(userId);
  const catchAllTicket = await getCatchAllTicket(userId, options.catchAllIssueId);

  const wakaRows = await prisma.wakaTimeDailySummary.findMany({
    where: { userId, date: { gte: options.start, lte: options.end } },
    orderBy: { date: "asc" },
  });

  // Get existing wakatime time entries for the matched tickets in the range
  // (includes the catch-all ticket so its already-logged dates are detected
  // too — otherwise a re-run would try to re-create an existing TimeEntry
  // and hit the issueId+wakaTimeDate unique constraint).
  const ticketIds = Array.from(new Set([
    ...Array.from(index.values()).map((m) => m.ticket.id),
    ...(catchAllTicket ? [catchAllTicket.id] : []),
  ]));
  const existingEntries = ticketIds.length > 0
    ? await prisma.timeEntry.findMany({
        where: {
          issueId: { in: ticketIds },
          wakaTimeDate: { not: null },
        },
        select: { id: true, issueId: true, wakaTimeDate: true, hours: true, redmineTimeEntryId: true },
      })
    : [];
  const existingByKey = new Map(
    existingEntries.map((e) => [`${e.issueId}:${e.wakaTimeDate}`, e]),
  );

  // Accumulate per-ticket, per-day data. Keyed by date so a ticket with
  // multiple matched repos active on the same day gets one summed entry
  // per day, not one per repo (TimeEntry is unique on issueId+wakaTimeDate).
  const matchedMap = new Map<string, {
    match: TicketMatch;
    perDayMap: Map<string, number>;
    totalSeconds: number;
    alreadyLoggedDates: Set<string>;
    existingByDate: Map<string, ExistingWakaEntry>;
    // Every distinct WakaTime project name that rolled into this ticket —
    // usually just one, but the catch-all bucket in particular can merge
    // several unrelated projects onto the same ticket+day. Kept so `repo`
    // stays traceable to all of them instead of only whichever hit first.
    sourceProjects: Set<string>;
  }>();

  const unmatchedMap = new Map<string, {
    project: string;
    perDay: Array<{ date: string; seconds: number }>;
    totalSeconds: number;
  }>();

  for (const row of wakaRows) {
    const projects = (row.projectsJson as WakaBreakdown[]) ?? [];
    for (const proj of projects) {
      if (proj.total_seconds <= 0) continue;

      const match: TicketMatch | null =
        findMatch(proj.name, index) ??
        (catchAllTicket
          ? { ticket: catchAllTicket, link: { id: "catchall", repositoryFullName: proj.name, url: "" } }
          : null);

      if (match) {
        const key = match.ticket.id;
        const loggedKey = `${match.ticket.id}:${row.date}`;
        const existing = matchedMap.get(key);
        const entry = existing ?? {
          match,
          perDayMap: new Map<string, number>(),
          totalSeconds: 0,
          alreadyLoggedDates: new Set<string>(),
          existingByDate: new Map<string, ExistingWakaEntry>(),
          sourceProjects: new Set<string>(),
        };
        entry.perDayMap.set(row.date, (entry.perDayMap.get(row.date) ?? 0) + proj.total_seconds);
        entry.totalSeconds += proj.total_seconds;
        entry.sourceProjects.add(proj.name);
        const existingRow = existingByKey.get(loggedKey);
        if (existingRow) {
          entry.alreadyLoggedDates.add(row.date);
          entry.existingByDate.set(row.date, {
            id: existingRow.id,
            hours: existingRow.hours,
            redmineTimeEntryId: existingRow.redmineTimeEntryId,
          });
        }
        if (!existing) matchedMap.set(key, entry);
      } else {
        const uKey = proj.name;
        const existing = unmatchedMap.get(uKey);
        if (existing) {
          existing.perDay.push({ date: row.date, seconds: proj.total_seconds });
          existing.totalSeconds += proj.total_seconds;
        } else {
          unmatchedMap.set(uKey, {
            project: proj.name,
            perDay: [{ date: row.date, seconds: proj.total_seconds }],
            totalSeconds: proj.total_seconds,
          });
        }
      }
    }
  }

  const matched: CorrelationRow[] = Array.from(matchedMap.values()).map((m) => ({
    ticketId: m.match.ticket.id,
    localIssueNumber: m.match.ticket.localIssueNumber,
    subject: m.match.ticket.subject,
    // The linked repo's full name in the normal single-source case. When
    // distinct WakaTime project names merged into this ticket (the
    // catch-all bucket in particular can do this — see matchedMap's
    // sourceProjects), list all of them instead so every original source
    // stays traceable rather than showing only whichever hit first.
    repo: m.sourceProjects.size > 1
      ? Array.from(m.sourceProjects).sort().join(", ")
      : m.match.link.repositoryFullName,
    totalSeconds: m.totalSeconds,
    perDay: Array.from(m.perDayMap.entries())
      .map(([date, seconds]) => ({ date, seconds }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    alreadyLoggedDates: Array.from(m.alreadyLoggedDates),
    existingEntriesByDate: Object.fromEntries(m.existingByDate),
  }));

  const unmatched: UnmatchedProject[] = Array.from(unmatchedMap.values());

  return { matched, unmatched };
}

export type AutoCreatedTicket = {
  issueId: string;
  localIssueNumber: number;
  project: string;
  repositoryFullName: string;
};

/**
 * Auto-create a personal ticket + GitHub link for any unmatched WakaTime
 * project whose tracked time in this window crosses `thresholdSeconds`.
 * Keeps one-off/trivial projects from being permanently linked while
 * giving anything real its own ticket instead of piling up in the
 * Misc/Unlinked catch-all forever. Idempotent: skips a project that
 * already has a matching link (from a prior run, or a manually-added
 * one) rather than creating a duplicate ticket for it.
 */
export async function autoCreateTicketsForUnmatched(
  userId: string,
  unmatched: UnmatchedProject[],
  options: { thresholdSeconds: number; defaultOwner: string }
): Promise<AutoCreatedTicket[]> {
  const eligible = unmatched.filter((u) => u.totalSeconds >= options.thresholdSeconds);
  const created: AutoCreatedTicket[] = [];
  if (eligible.length === 0) return created;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });

  for (const project of eligible) {
    const repositoryFullName = project.project.includes("/")
      ? project.project
      : `${options.defaultOwner}/${project.project}`;

    const existingLink = await prisma.issueGithubLink.findFirst({
      where: { userId, repositoryFullName },
      select: { id: true },
    });
    if (existingLink) continue;

    // localIssueNumber is derived from max()+1, which races another writer
    // (a concurrent apply, or manual ticket creation) onto the same number and
    // trips the (userId, source, localIssueNumber) unique constraint. Retry a
    // few times, recomputing the max each pass, before giving up on this one.
    let issue: Awaited<ReturnType<typeof prisma.issue.create>> | null = null;
    let localIssueNumber = 0;
    for (let attempt = 0; attempt < 5 && !issue; attempt++) {
      const maxNumber = await prisma.issue.aggregate({
        where: { userId, source: "local" },
        _max: { localIssueNumber: true },
      });
      localIssueNumber = (maxNumber._max.localIssueNumber ?? 0) + 1;

      try {
        issue = await prisma.issue.create({
          data: {
            userId,
            source: "local",
            localIssueNumber,
            subject: project.project,
            tracker: "Task",
            priority: "Normal",
            statusId: 1,
            statusName: "New",
            authorName: user?.displayName,
            assignedToName: user?.displayName,
            updatedOnRemote: new Date(),
            lastActivityAt: new Date(),
            lastActivityType: "auto_created_from_wakatime",
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") continue;
        throw error;
      }
    }
    if (!issue) continue;

    const url = `https://github.com/${repositoryFullName}`;
    const link = await prisma.issueGithubLink.create({
      data: {
        issueId: issue.id,
        userId,
        repositoryFullName,
        url,
        title: `Auto-linked from WakaTime (${(project.totalSeconds / 3600).toFixed(1)}h)`,
      },
    });

    await recordIssueActivityEvent({
      issueId: issue.id,
      eventType: "github_link",
      source: "local",
      sourceRemoteId: link.id,
      eventAt: link.createdAt,
      summary: link.url,
    });
    await recomputeIssueActivityIndex(issue.id);

    created.push({
      issueId: issue.id,
      localIssueNumber,
      project: project.project,
      repositoryFullName,
    });
  }

  return created;
}

// Below this, a day's growth since it was last logged is treated as float
// noise from the two-decimal rounding on both sides, not real new work.
export const MIN_HOURS_GROWTH = 0.005;

/**
 * Apply WakaTime hours as TimeEntry rows on matched tickets.
 * Idempotent: skips dates already logged (unique on issueId + wakaTimeDate)
 * *unless* that day's WakaTimeDailySummary total has grown since — the
 * summary keeps accumulating through the day, so a day logged early (the 6h
 * cron, or a ticket close) originally captured only a partial total. When it
 * has grown, the existing entry is corrected upward (never shrunk) instead
 * of left stale: a local-only row just gets its hours updated, but one
 * that's already been pushed to Redmine (redmineTimeEntryId set) needs
 * `client` to PUT the correction there too — without a client, or if that
 * PUT fails (e.g. a closed ticket rejecting the edit), the correction is
 * recorded in `updateFailures` and left for a later run.
 * dryRun: returns summary without writing.
 *
 * When `autoCreate` is given (and dryRun isn't set), unmatched projects
 * crossing its threshold get a real ticket created first — computed
 * against a catch-all-free pass so the catch-all bucket doesn't swallow
 * them before auto-create ever sees them — then the actual correlation
 * pass picks up the new ticket like any other matched one.
 */
export async function applyTimeEntries(
  userId: string,
  options: {
    start: string;
    end: string;
    dryRun?: boolean;
    catchAllIssueId?: string;
    autoCreate?: { thresholdSeconds: number; defaultOwner: string };
    client?: RedmineClient;
  }
): Promise<ApplyResult & { autoCreatedTickets?: AutoCreatedTicket[] }> {
  let autoCreatedTickets: AutoCreatedTicket[] | undefined;
  if (options.autoCreate && !options.dryRun) {
    const rawPass = await correlateWakaTime(userId, { start: options.start, end: options.end });
    autoCreatedTickets = await autoCreateTicketsForUnmatched(userId, rawPass.unmatched, options.autoCreate);
  }

  const correlation = await correlateWakaTime(userId, options);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let totalHours = 0;
  const entries: ApplyResult["entries"] = [];
  const updateFailures: ApplyResult["updateFailures"] = [];

  for (const row of correlation.matched) {
    for (const day of row.perDay) {
      if (day.seconds <= 0) continue;

      const hours = Math.round((day.seconds / 3600) * 100) / 100;
      const existing = row.existingEntriesByDate[day.date];

      if (existing) {
        const delta = hours - existing.hours;
        if (delta < MIN_HOURS_GROWTH) {
          skipped++;
          continue;
        }

        if (options.dryRun) {
          updated++;
          totalHours += delta;
          entries.push({ ticketId: row.ticketId, date: day.date, hours });
          continue;
        }

        if (existing.redmineTimeEntryId !== null) {
          if (!options.client) {
            // No client to push the correction with — leave it for a caller
            // that has one (the recurring-ticket close path, or a re-run of
            // this one with a client) to pick up later.
            updateFailures.push({ ticketId: row.ticketId, date: day.date, error: "No Redmine client to push the correction" });
            continue;
          }
          try {
            await options.client.updateTimeEntry(existing.redmineTimeEntryId, { hours });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            updateFailures.push({ ticketId: row.ticketId, date: day.date, error: message });
            continue;
          }
        }

        let staleRead = false;
        try {
          await prisma.$transaction(async (tx) => {
            // Pin the update to the hours value this pass read `existing`
            // as: a concurrent run (the 6h cron overlapping a manual apply
            // or a recurring-ticket close) may have already applied this
            // same correction between our read and this write. Guarding the
            // write on the old value means a losing run's updateMany
            // matches zero rows instead of re-incrementing spentHours for a
            // correction that already landed.
            const result = await tx.timeEntry.updateMany({
              where: { id: existing.id, hours: existing.hours },
              data: { hours },
            });
            if (result.count === 0) {
              staleRead = true;
              return;
            }
            await tx.issue.update({
              where: { id: row.ticketId },
              data: {
                lastActivityAt: new Date(),
                lastActivityType: "wakatime_time_logged",
                spentHours: { increment: delta },
              },
            });
          });
        } catch (error) {
          // The Redmine side (if any) is already corrected at this point —
          // record the local-write failure so it's visible, but don't retry
          // the Redmine call above on a later pass over the same data.
          const message = error instanceof Error ? error.message : String(error);
          updateFailures.push({ ticketId: row.ticketId, date: day.date, error: message });
          continue;
        }

        if (staleRead) {
          // Another run already applied this correction — nothing left to do.
          skipped++;
          continue;
        }

        updated++;
        totalHours += delta;
        entries.push({ ticketId: row.ticketId, date: day.date, hours });
        continue;
      }

      if (options.dryRun) {
        created++;
        totalHours += hours;
        entries.push({ ticketId: row.ticketId, date: day.date, hours });
        continue;
      }

      // The TimeEntry write and the spentHours increment must be atomic — a
      // partial failure would otherwise double-count or lose hours. And a
      // concurrent run (the 6h cron overlapping a manual apply) can beat us to
      // the same issueId+wakaTimeDate: that surfaces as a P2002 unique
      // violation, which means "already logged", not an error — skip it
      // instead of aborting the whole batch.
      try {
        await prisma.$transaction([
          prisma.timeEntry.create({
            data: {
              issueId: row.ticketId,
              userId,
              hours,
              spentOn: new Date(day.date),
              activityId: 31,
              activityName: "Development",
              comments: `WakaTime: ${row.repo.split("/").pop() ?? row.repo} ${day.date}`,
              source: "wakatime",
              wakaTimeDate: day.date,
            },
          }),
          prisma.issue.update({
            where: { id: row.ticketId },
            data: {
              lastActivityAt: new Date(),
              lastActivityType: "wakatime_time_logged",
              spentHours: { increment: hours },
            },
          }),
        ]);
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          skipped++;
          continue;
        }
        throw error;
      }

      created++;
      totalHours += hours;
      entries.push({ ticketId: row.ticketId, date: day.date, hours });
    }
  }

  return { created, updated, skipped, totalHours, entries, updateFailures, autoCreatedTickets };
}
