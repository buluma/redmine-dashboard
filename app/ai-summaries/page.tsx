import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";

export const runtime = "nodejs";

interface ParsedSummary {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  confidence: number;
}

function parseSummaryText(text: string | null): ParsedSummary | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary ?? "",
      keyPoints: parsed.keyPoints ?? [],
      actionItems: parsed.actionItems ?? [],
      confidence: parsed.confidence ?? 0,
    };
  } catch {
    return { summary: text, keyPoints: [], actionItems: [], confidence: 0 };
  }
}

function linkify(text: string): React.ReactElement {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  if (parts.length === 1) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="ai-link">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const modelsUsed = new Map<string, number>();
  const statusesMap = new Map<string, number>();
  const projectsMap = new Map<string, number>();
  const totalSummaries = summaries.length;

  for (const s of summaries) {
    modelsUsed.set(s.model, (modelsUsed.get(s.model) ?? 0) + 1);
    statusesMap.set(s.issue.statusName, (statusesMap.get(s.issue.statusName) ?? 0) + 1);
    if (s.issue.projectName) {
      projectsMap.set(s.issue.projectName, (projectsMap.get(s.issue.projectName) ?? 0) + 1);
    }
  }

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
              {totalSummaries} summary{totalSummaries !== 1 ? "ies" : "y"} generated across your issues
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      {summaries.length === 0 ? (
        <section className="card">
          <div className="reports-head">
            <div>
              <h2>No AI Summaries Yet</h2>
              <p className="muted">AI summaries will appear here once generated for your issues.</p>
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
                <p className="muted">Distribution of AI summaries across your issues</p>
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
                <p className="report-label">Top Model</p>
                <p className="report-value" style={{ fontSize: "1.1rem" }}>
                  {topModels[0]?.[0] ?? "—"}
                </p>
                <p className="report-foot">
                  {topModels[0]?.[1] ?? 0} summaries generated
                </p>
              </article>

              <article className="report-card">
                <p className="report-label">Projects Covered</p>
                <p className="report-value">{topProjects.length}</p>
                <p className="report-foot">
                  {topProjects.length > 0 ? topProjects[0][0] : "No projects yet"}
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
          </section>

          {/* Detailed Summaries */}
          <section className="card">
            <div className="reports-head">
              <div>
                <h2>All Summaries</h2>
                <p className="muted">
                  Structured AI insights for each issue
                </p>
              </div>
            </div>

            <div className="summaries-list">
              {summaries.map((summary) => {
                const parsed = parseSummaryText(summary.summary);

                return (
                  <article key={summary.id} className="summary-card">
                    <div className="summary-header">
                      <div className="summary-issue-info">
                        <Link
                          href={`/issues/${summary.issue.redmineIssueId}`}
                          className="summary-issue-link"
                        >
                          #{summary.issue.redmineIssueId} - {summary.issue.subject}
                        </Link>
                        <div className="summary-meta">
                          <span className="summary-status">{summary.issue.statusName}</span>
                          {summary.issue.priority && (
                            <span className="summary-priority">{summary.issue.priority}</span>
                          )}
                          {summary.issue.projectName && (
                            <span className="summary-project">{summary.issue.projectName}</span>
                          )}
                        </div>
                      </div>
                      <div className="summary-side">
                        <span className="summary-model">{summary.model}</span>
                        <span className="summary-date">{formatDate(summary.updatedAt)}</span>
                      </div>
                    </div>

                    {/* Rendered exactly like AiIssueActions */}
                    {parsed && (
                      <div className="ai-result">
                        <div className="ai-result-header">
                          <h5>AI Summary</h5>
                          {parsed.confidence > 0 && (
                            <span className="ai-confidence">
                              {Math.round(parsed.confidence * 100)}% confident
                            </span>
                          )}
                        </div>

                        {parsed.summary && (
                          <div className="ai-section">
                            <p>{linkify(parsed.summary)}</p>
                          </div>
                        )}

                        {parsed.keyPoints.length > 0 && (
                          <div className="ai-section">
                            <h6>Key Points</h6>
                            <ul>
                              {parsed.keyPoints.map((point, i) => (
                                <li key={i}>{linkify(point)}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {parsed.actionItems.length > 0 && (
                          <div className="ai-section">
                            <h6>Action Items</h6>
                            <ul className="action-items">
                              {parsed.actionItems.map((item, i) => (
                                <li key={i}>{linkify(item)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="summary-footer">
                      <span>
                        {summary.issue.assignedToName
                          ? `Assigned to: ${summary.issue.assignedToName}`
                          : "Unassigned"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
