import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import path from "path";

/**
 * E2E coverage for the external API money paths:
 *  - API-key auth on every /api/external/tickets surface
 *  - Local ticket PATCH (persistence + journal creation)
 *  - Correlation apply idempotency (no duplicate TimeEntry on re-run)
 *
 * Seeds its own fixtures directly through Prisma against the same database
 * the dev server uses, and cleans them up afterwards. WakaTime fixture rows
 * use 2001 dates so they can never collide with real history (starts 2018).
 *
 * The valid-key tests need the server to know EXTERNAL_API_KEYS; playwright
 * config injects E2E_EXTERNAL_API_KEY into the webServer env. A manually
 * started dev server without that env var will fail the valid-key tests —
 * let playwright start the server itself.
 */

// Fixtures are shared file-level state; parallel workers would each run
// beforeAll and collide on the unique (userId, date) WakaTime rows.
// Generous timeout: the first hit on each route pays next-dev compile cost.
test.describe.configure({ mode: "serial", timeout: 120_000 });

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.E2E_EXTERNAL_API_KEY || "e2e-test-key";
const FIXTURE_REPO = "e2e/zzq-e2e-corr-fixture";
const FIXTURE_DATES = ["2001-01-01", "2001-01-02"];

// Mirror Prisma's resolution of relative sqlite paths (relative to the
// schema directory, i.e. prisma/), so the test process opens the same file
// as the dev server regardless of CWD quirks.
function resolveDbUrl(): string {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  if (!raw.startsWith("file:")) return raw;
  const p = raw.slice("file:".length);
  if (path.isAbsolute(p)) return raw;
  return "file:" + path.resolve(process.cwd(), "prisma", p);
}

const prisma = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } });

let userId: string;
let createdUser = false;
let issueId: string;
let localIssueNumber: number;

test.beforeAll(async () => {
  // Correlation routes act on the first user by createdAt; reuse it so the
  // fixtures land where the route looks. Create one on a fresh (CI) db.
  let user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    user = await prisma.user.create({
      data: { emailOrUsername: "e2e-external-api@example.com", displayName: "E2E" },
    });
    createdUser = true;
  }
  userId = user.id;

  const maxNum = await prisma.issue.aggregate({
    where: { userId, source: "local" },
    _max: { localIssueNumber: true },
  });
  localIssueNumber = (maxNum._max.localIssueNumber ?? 0) + 1;

  const issue = await prisma.issue.create({
    data: {
      userId,
      source: "local",
      localIssueNumber,
      subject: "E2E external API fixture ticket",
      description: "Seeded by e2e/external-api.spec.ts",
      tracker: "Task",
      priority: "Normal",
      statusId: 1,
      statusName: "New",
      authorName: "E2E",
      projectName: "E2E",
      updatedOnRemote: new Date(),
      lastActivityAt: new Date(),
      lastActivityType: "local_create",
    },
  });
  issueId = issue.id;

  await prisma.issueGithubLink.create({
    data: {
      issueId,
      userId,
      repositoryFullName: FIXTURE_REPO,
      url: `https://github.com/${FIXTURE_REPO}`,
      title: "E2E correlation fixture",
    },
  });

  for (const date of FIXTURE_DATES) {
    await prisma.wakaTimeDailySummary.create({
      data: {
        userId,
        date,
        totalSeconds: 3600,
        projectsJson: [{ name: "zzq-e2e-corr-fixture", total_seconds: 3600 }],
      },
    });
  }
});

test.afterAll(async () => {
  await prisma.timeEntry.deleteMany({ where: { issueId } });
  await prisma.issueJournal.deleteMany({ where: { issueId } });
  await prisma.issueGithubLink.deleteMany({ where: { issueId } });
  await prisma.wakaTimeDailySummary.deleteMany({
    where: { userId, date: { in: FIXTURE_DATES } },
  });
  await prisma.issue.deleteMany({ where: { id: issueId } });
  if (createdUser) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

test.describe("external API auth", () => {
  test("ticket list rejects a missing key", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/external/tickets`);
    expect(res.status()).toBe(401);
  });

  test("ticket list rejects an invalid key", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/external/tickets`, {
      headers: { "x-api-key": "not-a-real-key" },
    });
    expect(res.status()).toBe(401);
  });

  test("ticket detail rejects an invalid key", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/external/tickets/L-${localIssueNumber}`, {
      headers: { "x-api-key": "not-a-real-key" },
    });
    expect(res.status()).toBe(401);
  });

  test("ticket PATCH rejects an invalid key", async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/external/tickets/L-${localIssueNumber}`, {
      headers: { "x-api-key": "not-a-real-key" },
      data: { notes: "should never land" },
    });
    expect(res.status()).toBe(401);
  });

  test("correlation apply rejects an invalid key", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/external/correlation`, {
      headers: { "x-api-key": "not-a-real-key" },
      data: { start: FIXTURE_DATES[0], end: FIXTURE_DATES[1] },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("local ticket read + PATCH", () => {
  test("detail resolves the L-N identifier", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/external/tickets/L-${localIssueNumber}`, {
      headers: { "x-api-key": API_KEY },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.subject).toBe("E2E external API fixture ticket");
  });

  test("PATCH persists fields and writes a journal entry", async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/external/tickets/L-${localIssueNumber}`, {
      headers: { "x-api-key": API_KEY },
      data: {
        description: "Updated by e2e PATCH",
        doneRatio: 40,
        notes: "e2e journal note",
      },
    });
    expect(res.status()).toBe(200);

    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.description).toBe("Updated by e2e PATCH");
    expect(issue.doneRatio).toBe(40);

    const journal = await prisma.issueJournal.findFirst({
      where: { issueId, notes: "e2e journal note" },
    });
    expect(journal).not.toBeNull();
  });
});

test.describe("correlation apply idempotency", () => {
  test("re-applying the same range never duplicates TimeEntry rows", async ({ request }) => {
    const payload = { start: FIXTURE_DATES[0], end: FIXTURE_DATES[1] };

    const first = await request.post(`${BASE_URL}/api/external/correlation`, {
      headers: { "x-api-key": API_KEY },
      data: payload,
    });
    expect(first.status()).toBe(200);
    const firstBody = await first.json();
    const firstForTicket = (firstBody.entries as Array<{ ticketId: string }>).filter(
      (e) => e.ticketId === issueId,
    );
    expect(firstForTicket).toHaveLength(FIXTURE_DATES.length);

    const second = await request.post(`${BASE_URL}/api/external/correlation`, {
      headers: { "x-api-key": API_KEY },
      data: payload,
    });
    expect(second.status()).toBe(200);
    const secondBody = await second.json();
    const secondForTicket = (secondBody.entries as Array<{ ticketId: string }>).filter(
      (e) => e.ticketId === issueId,
    );
    expect(secondForTicket).toHaveLength(0);
    expect(secondBody.skipped).toBeGreaterThanOrEqual(FIXTURE_DATES.length);

    const rows = await prisma.timeEntry.findMany({ where: { issueId } });
    expect(rows).toHaveLength(FIXTURE_DATES.length);
    for (const row of rows) {
      expect(row.source).toBe("wakatime");
      expect(row.hours).toBeCloseTo(1);
    }
  });
});
