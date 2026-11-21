// Pushes Redmine tickets newly assigned to the user into gr8r (the owner's
// task server) as tasks, so the work shows up there without copying it by
// hand. Runs from syncSingleIssue after each upsert, independently of the
// Slack/webhook notification flag. gr8r → Redmine status changes are manual
// for now: nothing here reads back from gr8r beyond the created task's key.
import { prisma } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { normalizeProjectName } from "@/src/lib/correlation";
import { trackFailure, trackInfo, trackSuccess } from "@/src/lib/telemetry";

export type Gr8rProject = { key: string; name: string; repo?: string | null };

export type Gr8rIssue = {
  id: string;
  redmineIssueId: number | null;
  subject: string;
  description: string | null;
  projectName: string | null;
  tracker: string | null;
  priority: string | null;
  statusName: string;
  assignedToId: number | null;
  dueDate: Date | null;
  startDate: Date | null;
  estimatedHours: number | null;
  updatedOnRemote: Date;
};

type Gr8rClient = {
  normalizedBaseUrl: string;
  getCurrentUser(): Promise<{ id: number }>;
};

export type Gr8rPushResult =
  | { pushed: true; taskKey: string; project: string; via: Gr8rRoute }
  | { pushed: false; reason: "disabled" | "not-newly-assigned" | "already-linked" | "no-project" }
  | { pushed: false; reason: "failed"; error: string };

type Gr8rRoute = "repo" | "name" | "fallback";

// A ticket first seen (or reassigned) longer ago than this in Redmine time is
// old work, not new: it keeps a rebuilt or re-scoped cache, where every
// assigned ticket looks freshly created, from flooding gr8r with backlog.
const MAX_TICKET_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GR8R_TIMEOUT_MS = 10_000;
const CURRENT_USER_TTL_MS = 60 * 60 * 1000;

/**
 * Pick the gr8r project for a ticket, following the time-tracking correlation:
 * a GitHub repo linked to the ticket matches a gr8r project linked to the same
 * repo (names normalized as correlation does). A repo two gr8r projects share
 * is ambiguous and skipped, as correlation skips ties. Next the Redmine project
 * name matches a gr8r project name, then the configured fallback key.
 */
export function resolveGr8rProject(
  ticket: { repos: string[]; redmineProjectName: string | null },
  projects: Gr8rProject[],
  fallbackKey: string | undefined,
): { key: string; via: Gr8rRoute } | null {
  for (const repo of ticket.repos) {
    const wanted = normalizeProjectName(repo);
    if (!wanted) continue;
    const hits = projects.filter((p) => p.repo && normalizeProjectName(p.repo) === wanted);
    if (hits.length === 1) return { key: hits[0].key, via: "repo" };
  }

  const wantedName = normalizeProjectName(ticket.redmineProjectName);
  if (wantedName) {
    const hits = projects.filter((p) => normalizeProjectName(p.name) === wantedName);
    if (hits.length === 1) return { key: hits[0].key, via: "name" };
  }

  if (fallbackKey) {
    const fallback = projects.find((p) => p.key.toLowerCase() === fallbackKey.toLowerCase());
    if (fallback) return { key: fallback.key, via: "fallback" };
  }
  return null;
}

/**
 * New work only: a ticket assigned to me that Converge is seeing for the first
 * time, or that has just been reassigned to me. Updates to tickets that were
 * already mine never push, so existing assignments are not backfilled.
 */
export function shouldPushToGr8r(input: {
  meId: number;
  assignedToId: number | null;
  wasCreated: boolean;
  previousAssignedToId: number | null;
  updatedOnRemote: Date;
  now: Date;
}): boolean {
  if (input.assignedToId !== input.meId) return false;
  if (!input.wasCreated && input.previousAssignedToId === input.meId) return false;
  return input.now.getTime() - input.updatedOnRemote.getTime() <= MAX_TICKET_AGE_MS;
}

/** Redmine's priority names onto gr8r's default scale; unknown names leave gr8r's default. */
export function gr8rPriority(name: string | null): string | undefined {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("immediate") || lower.includes("urgent")) return "urgent";
  if (lower.includes("high")) return "high";
  if (lower.includes("normal")) return "medium";
  if (lower.includes("low")) return "low";
  return undefined;
}

const ESTIMATE_STEPS: Array<[number, string]> = [
  [0.5, "30m"],
  [1, "1h"],
  [2, "2h"],
  [4, "4h"],
  [8, "1d"],
  [16, "2d"],
  [24, "3d"],
  [40, "5d"],
];

/** Redmine estimated hours rounded up to the gr8r app's picker values (a day is 8h). */
export function gr8rEstimate(hours: number | null): string | undefined {
  if (!hours || hours <= 0) return undefined;
  return ESTIMATE_STEPS.find(([limit]) => hours <= limit)?.[1] ?? "8d";
}

function isoDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function buildTaskPayload(issue: Gr8rIssue, redmineBaseUrl: string, projectKey: string) {
  const url = `${redmineBaseUrl.replace(/\/+$/, "")}/issues/${issue.redmineIssueId}`;
  const facts = [
    issue.projectName && `Project: ${issue.projectName}`,
    issue.tracker && `Tracker: ${issue.tracker}`,
    `Status: ${issue.statusName}`,
    issue.priority && `Priority: ${issue.priority}`,
  ].filter(Boolean);
  const desc = [`Redmine #${issue.redmineIssueId}: ${url}`, facts.join(" · "), issue.description?.trim()]
    .filter(Boolean)
    .join("\n\n");

  const payload: Record<string, unknown> = {
    title: `Redmine #${issue.redmineIssueId}: ${issue.subject}`,
    project: projectKey,
    status: "todo",
    desc,
    // Explicit null: without a due date gr8r would default one two days out.
    due: isoDay(issue.dueDate),
  };
  const start = isoDay(issue.startDate);
  if (start) payload.start = start;
  const priority = gr8rPriority(issue.priority);
  if (priority) payload.priority = priority;
  const estimate = gr8rEstimate(issue.estimatedHours);
  if (estimate) payload.estimate = estimate;
  if (env.gr8rAssignee) payload.assignee = env.gr8rAssignee;
  return payload;
}

async function gr8rRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, env.gr8rUrl).toString(), {
    method,
    headers: {
      authorization: `Bearer ${env.gr8rToken}`,
      "content-type": "application/json",
      "x-gr8r-agent": env.gr8rAgent,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(GR8R_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(`gr8r ${method} ${path}: HTTP ${response.status}${data.error ? ` ${data.error}` : ""}`);
  }
  return data;
}

const currentUserCache = new Map<string, { id: number; expiresAt: number }>();

/** Test hook: forget cached Redmine user ids. */
export function resetGr8rCurrentUserCache(): void {
  currentUserCache.clear();
}

async function currentRedmineUserId(userId: string, client: Gr8rClient, now: Date): Promise<number> {
  const cacheKey = `${userId}|${client.normalizedBaseUrl}`;
  const cached = currentUserCache.get(cacheKey);
  if (cached && cached.expiresAt > now.getTime()) return cached.id;
  const me = await client.getCurrentUser();
  currentUserCache.set(cacheKey, { id: me.id, expiresAt: now.getTime() + CURRENT_USER_TTL_MS });
  return me.id;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Create a gr8r task for a ticket newly assigned to the user. Never throws:
 * a gr8r outage must not fail the Redmine sync. A failed push is logged and
 * not retried, since the ticket is no longer "newly" assigned on later polls.
 */
export async function pushIssueToGr8r(input: {
  userId: string;
  client: Gr8rClient;
  issue: Gr8rIssue;
  wasCreated: boolean;
  previousAssignedToId: number | null;
  now?: Date;
}): Promise<Gr8rPushResult> {
  if (!env.gr8rUrl || !env.gr8rToken) return { pushed: false, reason: "disabled" };
  const { issue, client } = input;
  const now = input.now ?? new Date();
  if (issue.assignedToId == null || issue.redmineIssueId == null) return { pushed: false, reason: "not-newly-assigned" };

  let claimId: string | null = null;
  try {
    const meId = await currentRedmineUserId(input.userId, client, now);
    const push = shouldPushToGr8r({
      meId,
      assignedToId: issue.assignedToId,
      wasCreated: input.wasCreated,
      previousAssignedToId: input.previousAssignedToId,
      updatedOnRemote: issue.updatedOnRemote,
      now,
    });
    if (!push) return { pushed: false, reason: "not-newly-assigned" };

    // Claim the ticket before calling gr8r so two overlapping syncs can't
    // both create a task for it.
    try {
      claimId = (await prisma.gr8rTaskLink.create({ data: { issueId: issue.id } })).id;
    } catch (error) {
      if (isUniqueViolation(error)) return { pushed: false, reason: "already-linked" };
      throw error;
    }

    const [{ projects }, links] = await Promise.all([
      gr8rRequest<{ projects: Gr8rProject[] }>("GET", "/api/projects"),
      prisma.issueGithubLink.findMany({ where: { issueId: issue.id }, select: { repositoryFullName: true } }),
    ]);
    const route = resolveGr8rProject(
      { repos: links.map((l) => l.repositoryFullName), redmineProjectName: issue.projectName },
      projects,
      env.gr8rFallbackProject,
    );
    if (!route) {
      await prisma.gr8rTaskLink.delete({ where: { id: claimId } });
      trackInfo("gr8r.task_push.no_project", { redmineIssueId: issue.redmineIssueId, projectName: issue.projectName });
      return { pushed: false, reason: "no-project" };
    }

    const { task } = await gr8rRequest<{ task: { key: string } }>(
      "POST",
      "/api/tasks",
      buildTaskPayload(issue, client.normalizedBaseUrl, route.key),
    );
    await prisma.gr8rTaskLink.update({ where: { id: claimId }, data: { taskKey: task.key } });
    trackSuccess({
      event: "gr8r.task_push.succeeded",
      metricName: "gr8r_task_push_succeeded",
      metricTags: { via: route.via },
      data: { redmineIssueId: issue.redmineIssueId, taskKey: task.key },
    });
    return { pushed: true, taskKey: task.key, project: route.key, via: route.via };
  } catch (error) {
    if (claimId) {
      await prisma.gr8rTaskLink.delete({ where: { id: claimId } }).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    trackFailure({
      event: "gr8r.task_push.failed",
      error,
      metricName: "gr8r_task_push_failed",
      data: { redmineIssueId: issue.redmineIssueId },
    });
    return { pushed: false, reason: "failed", error: message };
  }
}
