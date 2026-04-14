import { prisma } from "@/src/lib/db";
import { getSessionUserId } from "@/src/lib/session";
import { PersonalTicketCreateForm } from "./personal-ticket-create-form";

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

  function formatDate(date: Date | null): string {
    if (!date) return "—";
    return date.toLocaleDateString();
  }

  function formatTimeAgo(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${Math.max(diffMins, 1)}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function statusDotClass(statusName: string): string {
    const lower = statusName.toLowerCase();
    if (lower.includes("closed") || lower.includes("done") || lower.includes("resolved")) return "dot-time";
    if (lower.includes("progress") || lower.includes("feedback")) return "dot-time";
    return "dot-comment";
  }

  return (
    <section className="card">
      <details className="collapsible-section" open>
        <summary className="collapsible-summary">
          <div className="collapsible-head">
            <h2>📋 My Tickets</h2>
            <p className="muted">Personal tickets — local only, never synced to Redmine</p>
          </div>
        </summary>

        <div className="ai-overview">
          <PersonalTicketCreateForm />

          {issues.length === 0 && (
            <p className="text-center text-gray-500 py-8">No personal tickets found. Create one from the dashboard.</p>
          )}

          {issues.length > 0 && (
            <div className="heimdall-tickets-feed activity-timeline">
              {issues.map((issue) => (
                <a
                  key={issue.id}
                  href={`/issues/${issue.id}`}
                  className="activity-item"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className={`activity-dot ${statusDotClass(issue.statusName)}`} />
                  <div className="activity-body">
                    <div className="activity-head">
                      <span className="activity-issue">
                        #{issue.localIssueNumber ?? "—"} {issue.subject}
                      </span>
                      <span className="activity-time">{formatTimeAgo(issue.updatedAt)}</span>
                    </div>
                    <div className="activity-detail">
                      <span className="activity-type type-comment">{issue.tracker ?? "Ticket"}</span>
                      <span className="activity-note">
                        {issue.statusName} · {issue.priority || "Normal"} · {issue.doneRatio ?? 0}%
                      </span>
                      {issue.dueDate && (
                        <span className="activity-note">Due {formatDate(issue.dueDate)}</span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
