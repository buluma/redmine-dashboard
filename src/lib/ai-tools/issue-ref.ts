import { prisma } from '@/src/lib/db';

// ---------------------------------------------------------------------------
// Ticket reference resolution (Redmine #ID vs local L-N)
// ---------------------------------------------------------------------------

export type IssueRef =
  | { kind: 'redmine'; id: number }
  | { kind: 'local'; n: number };

/** Parse "4521", 4521, "L-5", "l5" into a typed ticket reference. */
export function parseIssueRef(raw: unknown): IssueRef {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return { kind: 'redmine', id: raw };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const localMatch = trimmed.match(/^[Ll]-?(\d+)$/);
    if (localMatch) {
      return { kind: 'local', n: parseInt(localMatch[1], 10) };
    }
    if (/^#?\d+$/.test(trimmed)) {
      const id = parseInt(trimmed.replace('#', ''), 10);
      if (id > 0) return { kind: 'redmine', id };
    }
  }
  throw new Error('issue_id must be a Redmine issue ID (e.g. 4521) or a local ticket reference (e.g. "L-5")');
}

/** Fetch the local DB row for an L-N reference; throws when it does not exist. */
export async function requireLocalIssue(ref: { n: number }, userId: string) {
  const issue = await prisma.issue.findFirst({
    where: { userId, source: 'local', localIssueNumber: ref.n },
  });
  if (!issue) {
    throw new Error(`Local ticket L-${ref.n} not found`);
  }
  return issue;
}

/**
 * Append a journal entry to a local ticket, mirroring the conventions used
 * by the external API's PATCH handler (sequential redmineJournalId).
 */
export async function writeLocalJournal(
  issueId: string,
  notes: string | null,
  details?: Array<{ property: string; name: string; old_value: string; new_value: string }>,
) {
  const maxJ = await prisma.issueJournal.aggregate({
    where: { issueId },
    _max: { redmineJournalId: true },
  });
  await prisma.issueJournal.create({
    data: {
      issueId,
      redmineJournalId: (maxJ._max.redmineJournalId ?? 0) + 1,
      author: 'AI',
      notes,
      detailsJson: details && details.length > 0 ? details : undefined,
      createdOnRemote: new Date(),
    },
  });
}

/** Data common to every local-ticket mutation. */
export function localTouch() {
  const now = new Date();
  return { updatedOnRemote: now, lastActivityAt: now, lastActivityType: 'local_update' };
}
