import Link from "next/link";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { AiSummariesClient } from "./ai-summaries-client";
import { AiChatHistoryClient } from "./ai-chat-history-client";
import { AiSummariesHeader } from "./ai-summaries-header";
import { StatCard } from "@/src/components/reports/charts";

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
  }).catch(() => []);

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
  }).catch(() => []);

  const modelsUsed = new Map<string, { count: number; inputTokens: number; outputTokens: number }>();
  const statusesMap = new Map<string, number>();
  const prioritiesMap = new Map<string, number>();
  const projectsMap = new Map<string, number>();
  const totalSummaries = summaries.length;
  const totalChatMessages = chatMessages.length;
  const userMessages = chatMessages.filter((m) => m.role === "user").length;
  const aiMessages = chatMessages.filter((m) => m.role === "assistant").length;

  // Unique issues count
  const uniqueIssueIds = new Set(summaries.map((s) => s.issue.id));
  const chatUniqueIssueIds = new Set(chatMessages.map((m) => m.issue.redmineIssueId));
  const totalIssueCount = new Set([...uniqueIssueIds, ...chatUniqueIssueIds]).size;

  for (const s of summaries) {
    const existing = modelsUsed.get(s.model) ?? { count: 0, inputTokens: 0, outputTokens: 0 };
    modelsUsed.set(s.model, {
      count: existing.count + 1,
      inputTokens: existing.inputTokens + (s.promptEvalCount ?? 0),
      outputTokens: existing.outputTokens + (s.evalCount ?? 0),
    });
    statusesMap.set(s.issue.statusName, (statusesMap.get(s.issue.statusName) ?? 0) + 1);
    if (s.issue.projectName) {
      projectsMap.set(s.issue.projectName, (projectsMap.get(s.issue.projectName) ?? 0) + 1);
    }
    if (s.issue.priority) {
      prioritiesMap.set(s.issue.priority, (prioritiesMap.get(s.issue.priority) ?? 0) + 1);
    }
  }

  // Chat stats
  const chatModelsUsed = new Map<string, { count: number; inputTokens: number; outputTokens: number }>();
  const chatIssues = new Map<number, number>();
  for (const m of chatMessages) {
    if (m.model) {
      const existing = chatModelsUsed.get(m.model) ?? { count: 0, inputTokens: 0, outputTokens: 0 };
      chatModelsUsed.set(m.model, {
        count: existing.count + 1,
        inputTokens: existing.inputTokens + (m.promptEvalCount ?? 0),
        outputTokens: existing.outputTokens + (m.evalCount ?? 0),
      });
    }
    if (m.issue.redmineIssueId) {
      chatIssues.set(m.issue.redmineIssueId, (chatIssues.get(m.issue.redmineIssueId) ?? 0) + 1);
    }
  }

  const topModels = Array.from(modelsUsed.entries())
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topStatuses = Array.from(statusesMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const topPriorities = Array.from(prioritiesMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const topProjects = Array.from(projectsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const allModels = new Map<string, { summaries: number; chat: number; inputTokens: number; outputTokens: number }>();
  
  // Aggregate summary model usage
  for (const [model, data] of modelsUsed) {
    allModels.set(model, { 
      summaries: data.count, 
      chat: 0,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    });
  }
  // Aggregate chat model usage
  for (const [model, data] of chatModelsUsed) {
    const existing = allModels.get(model) ?? { summaries: 0, chat: 0, inputTokens: 0, outputTokens: 0 };
    allModels.set(model, { 
      summaries: existing.summaries, 
      chat: data.count,
      inputTokens: existing.inputTokens + data.inputTokens,
      outputTokens: existing.outputTokens + data.outputTokens,
    });
  }

  const topChatModels = Array.from(chatModelsUsed.entries())
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topChatIssues = Array.from(chatIssues.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxPriorityCount = topPriorities[0]?.[1] ?? 1;
  const maxStatusCount = topStatuses[0]?.[1] ?? 1;
  const maxChatIssueCount = topChatIssues[0]?.[1] ?? 1;

  // Calculate averages
  let avgSummaryDuration = 0;
  let summaryCount = 0;
  for (const s of summaries) {
    if (s.totalDuration) {
      const ms = Number(s.totalDuration) / 1_000_000;
      avgSummaryDuration += ms;
      summaryCount++;
    }
  }
  avgSummaryDuration = summaryCount > 0 ? avgSummaryDuration / summaryCount : 0;

  let avgChatDuration = 0;
  let chatCount = 0;
  for (const m of chatMessages) {
    if (m.totalDuration) {
      const ms = Number(m.totalDuration) / 1_000_000;
      avgChatDuration += ms;
      chatCount++;
    }
  }
  avgChatDuration = chatCount > 0 ? avgChatDuration / chatCount : 0;

  // Calculate total tokens
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const s of summaries) {
    totalInputTokens += s.promptEvalCount ?? 0;
    totalOutputTokens += s.evalCount ?? 0;
  }
  for (const m of chatMessages) {
    totalInputTokens += m.promptEvalCount ?? 0;
    totalOutputTokens += m.evalCount ?? 0;
  }
  const grandTotalTokens = totalInputTokens + totalOutputTokens;

  // Get all unique projects from summaries
  const uniqueProjects = [...new Set(summaries.map((s) => s.issue.projectName).filter(Boolean))];
  const uniqueStatuses = [...new Set(summaries.map((s) => s.issue.statusName))];

  return (
    <main className="dashboard reports-v2">
      <AiSummariesHeader
        totalSummaries={totalSummaries}
        totalChatMessages={totalChatMessages}
        issueCount={totalIssueCount}
      />

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
          {/* Stats Grid */}
          <div className="reports-stats-grid">
            <StatCard
              label="Summaries"
              value={totalSummaries}
              foot={`${uniqueIssueIds.size} issues · ${topModels[0]?.count ?? 0} with ${topModels[0]?.model ?? 'N/A'}`}
              icon="📝"
              tone="info"
            />
            <StatCard
              label="Chat Messages"
              value={totalChatMessages}
              foot={`${userMessages} you · ${aiMessages} AI`}
              icon="💬"
              tone="success"
            />
            <StatCard
              label="Issues"
              value={totalIssueCount}
              foot={`${uniqueProjects.length} projects · ${uniqueStatuses.length} statuses`}
              icon="📊"
              tone="success"
            />
            <StatCard
              label="Avg Response"
              value={avgSummaryDuration > 1000 
                ? `${(avgSummaryDuration / 1000).toFixed(1)}s` 
                : `${Math.round(avgSummaryDuration)}ms`}
              foot={topModels[0]?.model ?? "—"}
              icon="⚡"
              tone="warning"
            />
            <StatCard
              label="Total Tokens"
              value={grandTotalTokens.toLocaleString()}
              foot={`${totalInputTokens.toLocaleString()} in · ${totalOutputTokens.toLocaleString()} out`}
              icon="🔢"
              tone="info"
            />
          </div>

          {/* Overview Section */}
          <section className="ai-overview">

            {/* Model Usage */}
            <div className="ai-section">
              <div className="ai-section-head">
                <h3 className="ai-section-title">Model Usage</h3>
                <span className="ai-section-badge">{allModels.size} models</span>
              </div>
              <div className="ai-model-bars">
                {allModels.size === 0 ? (
                  <p className="muted ai-empty-copy">No model data yet.</p>
                ) : (
                  Array.from(allModels.entries())
                    .sort((a, b) => (b[1].summaries + b[1].chat) - (a[1].summaries + a[1].chat))
                    .map(([model, data], index) => {
                      const total = data.summaries + data.chat;
                      const maxTotal = Math.max(...Array.from(allModels.values()).map(d => d.summaries + d.chat));
                      const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                      const totalTokens = data.inputTokens + data.outputTokens;
                      return (
                        <div key={model} className="ai-model-row">
                          <div className="ai-model-name">
                            <span className="ai-model-rank">#{index + 1}</span>
                            <span className="ai-model-label">
                              {model.includes("claude") ? "🧠" : model.includes("gpt") ? "💬" : "🦙"} {model}
                            </span>
                          </div>
                          <div className="ai-model-bar-wrap">
                            <div className="ai-model-track">
                              <div
                                className="ai-model-bar"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="ai-model-stats">
                              {data.summaries > 0 && <span>{data.summaries} sum</span>}
                              {data.chat > 0 && <span>{data.chat} chat</span>}
                              {totalTokens > 0 && <span className="ai-model-tokens">{totalTokens.toLocaleString()} tokens</span>}
                            </div>
                          </div>
                          <div className="ai-model-total">{total}</div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="ai-overview-grid">
              {/* Priorities */}
              <div className="ai-overview-card">
                <div className="ai-overview-card-head">
                  <h4>By Priority</h4>
                  <span className="ai-overview-card-badge">{topPriorities.length}</span>
                </div>
                {topPriorities.length === 0 ? (
                  <p className="muted ai-empty-copy">No priority data.</p>
                ) : (
                  <div className="ai-list">
                    {topPriorities.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <div className="ai-list-main">
                          <span className="ai-list-name">{name}</span>
                          <span className="ai-list-meter">
                            <span className="ai-list-meter-fill" style={{ width: `${(count / maxPriorityCount) * 100}%` }} />
                          </span>
                        </div>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Statuses */}
              <div className="ai-overview-card">
                <div className="ai-overview-card-head">
                  <h4>By Status</h4>
                  <span className="ai-overview-card-badge">{topStatuses.length}</span>
                </div>
                {topStatuses.length === 0 ? (
                  <p className="muted ai-empty-copy">No status data.</p>
                ) : (
                  <div className="ai-list">
                    {topStatuses.map(([name, count]) => (
                      <div key={name} className="ai-list-row">
                        <div className="ai-list-main">
                          <span className="ai-list-name">{name}</span>
                          <span className="ai-list-meter">
                            <span className="ai-list-meter-fill" style={{ width: `${(count / maxStatusCount) * 100}%` }} />
                          </span>
                        </div>
                        <span className="ai-list-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top Chatted Issues */}
              <div className="ai-overview-card">
                <div className="ai-overview-card-head">
                  <h4>Most Chatted</h4>
                  <span className="ai-overview-card-badge">{topChatIssues.length}</span>
                </div>
                {topChatIssues.length === 0 ? (
                  <p className="muted ai-empty-copy">No chat issue activity yet.</p>
                ) : (
                  <div className="ai-list">
                    {topChatIssues.map(([issueId, count]) => {
                      return (
                        <div key={issueId} className="ai-list-row">
                          <div className="ai-list-main">
                            <Link href={`/issues/${issueId}`} className="ai-list-link">
                              #{issueId}
                            </Link>
                            <span className="ai-list-meter">
                              <span className="ai-list-meter-fill" style={{ width: `${(count / maxChatIssueCount) * 100}%` }} />
                            </span>
                          </div>
                          <span className="ai-list-count">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Chat History */}
          <section className="card">
            <details className="collapsible-section" open>
              <summary className="collapsible-summary">
                <div className="collapsible-head">
                  <h2>Chat History</h2>
                  <p className="muted">
                    {totalChatMessages} messages across {chatIssues.size} issue{chatIssues.size !== 1 ? "s" : ""}
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
