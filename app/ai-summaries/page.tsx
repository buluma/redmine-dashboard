import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { AiSummariesClient } from "./ai-summaries-client";

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

            <AiSummariesClient summaries={summaries} />
          </section>
        </>
      )}
    </main>
  );
}
