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
 * Correlate WakaTime daily summaries with personal tickets for a date range.
 */
export async function correlateWakaTime(
  userId: string,
  options: { start: string; end: string }
): Promise<CorrelationResult> {
  const index = await buildProjectTicketIndex(userId);

  const wakaRows = await prisma.wakaTimeDailySummary.findMany({
    where: { userId, date: { gte: options.start, lte: options.end } },
    orderBy: { date: "asc" },
  });

  // Get existing wakatime time entries for the matched tickets in the range
  const ticketIds = Array.from(new Set(
    Array.from(index.values()).map((m) => m.ticket.id)
  ));
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

  // Accumulate per-ticket, per-day data
  const matchedMap = new Map<string, {
    match: TicketMatch;
    perDay: Array<{ date: string; seconds: number }>;
    totalSeconds: number;
    alreadyLoggedDates: string[];
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

      const match = findMatch(proj.name, index);

      if (match) {
        const key = match.ticket.id;
        const existing = matchedMap.get(key);
        const loggedKey = `${match.ticket.id}:${row.date}`;
        if (existing) {
          existing.perDay.push({ date: row.date, seconds: proj.total_seconds });
          existing.totalSeconds += proj.total_seconds;
          if (loggedSet.has(loggedKey)) {
            existing.alreadyLoggedDates.push(row.date);
          }
        } else {
          matchedMap.set(key, {
            match,
            perDay: [{ date: row.date, seconds: proj.total_seconds }],
            totalSeconds: proj.total_seconds,
            alreadyLoggedDates: loggedSet.has(loggedKey) ? [row.date] : [],
          });
        }
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
    perDay: m.perDay,
    alreadyLoggedDates: m.alreadyLoggedDates,
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
  options: { start: string; end: string; dryRun?: boolean }
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
