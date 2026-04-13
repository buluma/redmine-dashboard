import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { AiSummariesClient } from "./ai-summaries-client";
import { AiChatHistoryClient } from "./ai-chat-history-client";

export const runtime = "nodejs";

export default async function AiSummariesPage() {
  const user = await requireCurrentUser();

  const summaries = await prisma.aiSummary.findMany({
    where: {
      issue: {
        userId: user.id,
      },
    },
    include: {
      issue: {
        select: {
          id: true,
          redmineIssueId: true,
          redmineBaseUrl: true,
          subject: true,
          statusName: true,
          priority: true,
          projectName: true,
          assignedToName: true,
          updatedAt: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const chatMessages = await prisma.aiChatMessage.findMany({
    where: {
      issue: {
        userId: user.id,
      },
    },
    include: {
      issue: {
        select: {
          redmineIssueId: true,
          redmineBaseUrl: true,
          subject: true,
          statusName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  const modelsUsed = new Map<string, number>();
  const statusesMap = new Map<string, number>();
  const projectsMap = new Map<string, number>();
  const totalSummaries = summaries.length;
  const totalChatMessages = chatMessages.length;
  const userMessages = chatMessages.filter((m) => m.role === "user").length;
  const aiMessages = chatMessages.filter((m) => m.role === "assistant").length;

  for (const s of summaries) {
    modelsUsed.set(s.model, (modelsUsed.get(s.model) ?? 0) + 1);
    statusesMap.set(s.issue.statusName, (statusesMap.get(s.issue.statusName) ?? 0) + 1);
    if (s.issue.projectName) {
      projectsMap.set(s.issue.projectName, (projectsMap.get(s.issue.projectName) ?? 0) + 1);
    }
  }

  // Chat stats
  const chatModelsUsed = new Map<string, number>();
  const chatIssues = new Map<number, number>();
  for (const m of chatMessages) {
    if (m.model) {
      chatModelsUsed.set(m.model, (chatModelsUsed.get(m.model) ?? 0) + 1);
    }
    chatIssues.set(m.issue.redmineIssueId, (chatIssues.get(m.issue.redmineIssueId) ?? 0) + 1);
  }
  const topChatModels = Array.from(chatModelsUsed.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topChatIssues = Array.from(chatIssues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topModels = Array.from(modelsUsed.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topStatuses = Array.from(statusesMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const topProjects = Array.from(projectsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <h1>AI Summaries</h1>
            <p className="muted">
              {totalSummaries} summary{totalSummaries !== 1 ? "ies" : "y"} · {userMessages} chat messages across {chatIssues.size} issue(s)
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      {summaries.length === 0 && chatMessages.length === 0 ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>No AI Activity Yet</h2>
              <p className="muted">Summaries and chat history will appear here once you interact with AI features.</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Overview Cards */}
          <section className="card reports-shell">
            <div className="reports-head">
              <div>
                <h2>Overview</h2>
                <p className="muted">Distribution of AI summaries and chat activity</p>
              </div>
            </div>

            <div className="reports-grid">
              <article className="report-card">
                <p className="report-label">Total Summaries</p>
                <p className="report-value">{totalSummaries}</p>
                <p className="report-foot">
                  Across {summaries.length > 0 ? "1" : "0"} issue(s)
                </p>
              </article>

              <article className="report-card">
                <p className="report-label">Chat Messages</p>
                <p className="report-value">{totalChatMessages}</p>
                <p className="report-foot">
                  {userMessages} user · {aiMessages} AI · {chatIssues.size} issue(s)
                </p>
              </article>

              <article className="report-card">
                <p className="report-label">Top Model</p>
                <p className="report-value" style={{ fontSize: "1.1rem" }}>
                  {topModels[0]?.[0] ?? "—"}
                </p>
                <p className="report-foot">
                  {topModels[0]?.[1] ?? 0} summaries generated
                </p>
              </article>
            </div>

            <div className="reports-grid">
              <article className="report-card">
                <p className="report-label">AI Models Used</p>
                {topModels.length === 0 && <p className="muted">No models yet.</p>}
                <div className="reports-list">
                  {topModels.map(([name, count]) => (
                    <div key={name} className="report-list-row">
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card">
                <p className="report-label">Status Distribution</p>
                <div className="reports-list">
                  {topStatuses.map(([name, count]) => (
                    <div key={name} className="report-list-row">
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="report-card">
                <p className="report-label">Top Projects</p>
                {topProjects.length === 0 && <p className="muted">No projects yet.</p>}
                <div className="reports-list">
                  {topProjects.map(([name, count]) => (
                    <div key={name} className="report-list-row">
                      <span>{name}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            {topChatModels.length > 0 && (
              <div className="reports-grid">
                <article className="report-card">
                  <p className="report-label">Chat Models</p>
                  <div className="reports-list">
                    {topChatModels.map(([name, count]) => (
                      <div key={name} className="report-list-row">
                        <span>{name}</span>
                        <strong>{count}</strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="report-card">
                  <p className="report-label">Most Chatted Issues</p>
                  <div className="reports-list">
                    {topChatIssues.map(([issueId, count]) => {
                      const issueMsg = chatMessages.find((m) => m.issue.redmineIssueId === issueId);
                      return (
                        <div key={issueId} className="report-list-row">
                          <Link href={`/issues/${issueId}`} className="report-list-link">
                            #{issueId} - {issueMsg?.issue.subject}
                          </Link>
                          <strong>{count}</strong>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="report-card">
                  <p className="report-label">Chat Activity</p>
                  <p className="report-value">{totalChatMessages}</p>
                  <p className="report-foot">
                    {userMessages} user · {aiMessages} AI
                  </p>
                </article>
              </div>
            )}
          </section>

          {/* Chat History */}
          <section className="card">
            <details className="collapsible-section" open>
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>Chat History</h2>
                  <p className="muted">
                    {totalChatMessages} messages across {chatIssues.size} issue(s)
                  </p>
                </div>
              </summary>

              {chatMessages.length === 0 ? (
                <p className="muted" style={{ padding: "1rem 0" }}>No chat messages yet.</p>
              ) : (
                <AiChatHistoryClient messages={chatMessages} />
              )}
            </details>
          </section>

          {/* Detailed Summaries (Collapsible) */}
          <section className="card">
            <details className="collapsible-section">
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>All Summaries</h2>
                  <p className="muted">
                    {summaries.length} structured AI insights
                  </p>
                </div>
              </summary>

              <AiSummariesClient summaries={summaries} />
            </details>
          </section>
        </>
      )}
    </main>
  );
}
