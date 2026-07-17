import { prisma } from "@/src/lib/db";
import { recordIssueActivityEvent, recomputeIssueActivityIndex } from "@/src/lib/activity-index";

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

export type CorrelationRow = {
  ticketId: string;
  localIssueNumber: number | null;
  subject: string;
  repo: string;
  totalSeconds: number;
  perDay: Array<{ date: string; seconds: number }>;
  alreadyLoggedDates: string[];
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
  skipped: number;
  totalHours: number;
  entries: Array<{ ticketId: string; date: string; hours: number }>;
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

/**
 * Find a ticket match for a WakaTime project name.
 * Strategy: exact normalized match first, then bidirectional substring.
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

  // Bidirectional substring match
  for (const [repoNorm, match] of index.entries()) {
    if (normalizedWaka.includes(repoNorm) || repoNorm.includes(normalizedWaka)) {
      return match;
    }
  }

  return null;
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
        select: { issueId: true, wakaTimeDate: true },
      })
    : [];
  const loggedSet = new Set(
    existingEntries.map((e) => `${e.issueId}:${e.wakaTimeDate}`)
  );

  // Accumulate per-ticket, per-day data. Keyed by date so a ticket with
  // multiple matched repos active on the same day gets one summed entry
  // per day, not one per repo (TimeEntry is unique on issueId+wakaTimeDate).
  const matchedMap = new Map<string, {
    match: TicketMatch;
    perDayMap: Map<string, number>;
    totalSeconds: number;
    alreadyLoggedDates: Set<string>;
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
        };
        entry.perDayMap.set(row.date, (entry.perDayMap.get(row.date) ?? 0) + proj.total_seconds);
        entry.totalSeconds += proj.total_seconds;
        if (loggedSet.has(loggedKey)) {
          entry.alreadyLoggedDates.add(row.date);
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
    repo: m.match.link.repositoryFullName,
    totalSeconds: m.totalSeconds,
    perDay: Array.from(m.perDayMap.entries())
      .map(([date, seconds]) => ({ date, seconds }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    alreadyLoggedDates: Array.from(m.alreadyLoggedDates),
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

/**
 * Apply WakaTime hours as TimeEntry rows on matched tickets.
 * Idempotent: skips dates already logged (unique on issueId + wakaTimeDate).
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
  }
): Promise<ApplyResult & { autoCreatedTickets?: AutoCreatedTicket[] }> {
  let autoCreatedTickets: AutoCreatedTicket[] | undefined;
  if (options.autoCreate && !options.dryRun) {
    const rawPass = await correlateWakaTime(userId, { start: options.start, end: options.end });
    autoCreatedTickets = await autoCreateTicketsForUnmatched(userId, rawPass.unmatched, options.autoCreate);
  }

  const correlation = await correlateWakaTime(userId, options);

  let created = 0;
  let skipped = 0;
  let totalHours = 0;
  const entries: ApplyResult["entries"] = [];

  for (const row of correlation.matched) {
    for (const day of row.perDay) {
      if (day.seconds <= 0) continue;

      const hours = Math.round((day.seconds / 3600) * 100) / 100;

      if (row.alreadyLoggedDates.includes(day.date)) {
        skipped++;
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
              activityId: 9,
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

  return { created, skipped, totalHours, entries, autoCreatedTickets };
}
