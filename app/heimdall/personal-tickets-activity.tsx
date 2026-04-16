import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { PersonalTicketsView } from "./personal-tickets-view";

function isLegacyPrismaIssueShapeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    message.includes("Unknown argument `source`") ||
    message.includes("Unknown field `localIssueNumber`") ||
    message.includes("Issue.source") ||
    message.includes("Issue.localIssueNumber") ||
    (code === "P2022" && (message.includes("source") || message.includes("localIssueNumber")))
  );
}

function isDbStatementTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("statement timeout") || message.includes("code: \"57014\"") || message.includes("P2024");
}

export async function PersonalTicketsDashboard() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const selectWithLocal = {
    id: true,
    localIssueNumber: true,
    subject: true,
    statusName: true,
    statusId: true,
    tracker: true,
    priority: true,
    priorityId: true,
    assignedToName: true,
    dueDate: true,
    doneRatio: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  const issues = await (async () => {
    try {
      return await prisma.issue.findMany({
        where: { userId, source: "local" },
        orderBy: [{ createdAt: "desc" }],
        select: selectWithLocal,
      });
    } catch (error) {
      if (isDbStatementTimeout(error)) {
        return [];
      }
      if (!isLegacyPrismaIssueShapeError(error)) {
        throw error;
      }

      const legacyIssues = await prisma.issue.findMany({
        where: { userId, redmineIssueId: null },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          subject: true,
          statusName: true,
          statusId: true,
          tracker: true,
          priority: true,
          priorityId: true,
          assignedToName: true,
          dueDate: true,
          doneRatio: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return legacyIssues.map((issue) => ({
        ...issue,
        localIssueNumber: null as number | null,
      }));
    }
  })();

  // Transform dates to ISO strings for client component
  const transformedIssues = issues.map(i => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
  }));

  return <PersonalTicketsView issues={transformedIssues} />;
}
