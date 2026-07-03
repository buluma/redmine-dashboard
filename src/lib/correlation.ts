import { prisma } from "@/src/lib/db";

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

/**
 * Apply WakaTime hours as TimeEntry rows on matched tickets.
 * Idempotent: skips dates already logged (unique on issueId + wakaTimeDate).
 * dryRun: returns summary without writing.
 */
export async function applyTimeEntries(
  userId: string,
  options: { start: string; end: string; dryRun?: boolean; catchAllIssueId?: string }
): Promise<ApplyResult> {
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

      created++;
      totalHours += hours;
      entries.push({ ticketId: row.ticketId, date: day.date, hours });

      if (!options.dryRun) {
        await prisma.timeEntry.create({
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
        });

        await prisma.issue.update({
          where: { id: row.ticketId },
          data: {
            lastActivityAt: new Date(),
            lastActivityType: "wakatime_time_logged",
            spentHours: { increment: hours },
          },
        });
      }
    }
  }

  return { created, skipped, totalHours, entries };
}
