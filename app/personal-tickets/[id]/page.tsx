import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { prisma } from "@/src/lib/db";
import Link from "next/link";

export const runtime = "nodejs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PersonalTicketPage({ params }: Props) {
  const { id } = await params;
  
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      timeEntries: {
        orderBy: { spentOn: "desc" },
        take: 20,
      },
    },
  });

  if (!issue || (issue.userId !== userId && issue.source !== "local")) {
    return (
      <main className="dashboard">
        <section className="card">
          <h1>Ticket Not Found</h1>
          <p className="muted">This ticket doesn't exist or you don't have access to it.</p>
          <Link href="/personal-tickets" className="secondary-button">
            ← Back to Personal Tickets
          </Link>
        </section>
      </main>
    );
  }

  const statusClass = issue.statusName === "Closed" || issue.statusName === "Completed" ? "resolved" : 
                   issue.statusName === "In Progress" ? "in-progress" : "";

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">
              {issue.localIssueNumber ? `Local #${issue.localIssueNumber}` : "Personal Ticket"}
            </p>
            <h1 className="issue-title">{issue.subject}</h1>
            <p className="muted">
              {issue.tracker || "Task"} • 
              <span className={`status-chip ${statusClass}`}> {issue.statusName}</span>
              {issue.priority && ` • ${issue.priority}`}
            </p>
          </div>
        </div>
      </header>

      {/* Details Grid */}
      <section className="card">
        <h2>Details</h2>
        <div className="kv-grid">
          <div>
            <p className="kv-label">Status</p>
            <p className="kv-value">{issue.statusName}</p>
          </div>
          <div>
            <p className="kv-label">Priority</p>
            <p className="kv-value">{issue.priority || "—"}</p>
          </div>
          <div>
            <p className="kv-label">Assignee</p>
            <p className="kv-value">{issue.assignedToName || "—"}</p>
          </div>
          <div>
            <p className="kv-label">Due Date</p>
            <p className="kv-value">{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <p className="kv-label">Created</p>
            <p className="kv-value">{new Date(issue.createdAt).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="kv-label">Updated</p>
            <p className="kv-value">{new Date(issue.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </section>

      {/* Description */}
      {issue.description && (
        <section className="card">
          <h2>Description</h2>
          <div className="description">
            <pre className="preserve-whitespace">{issue.description}</pre>
          </div>
        </section>
      )}

      {/* Time Entries */}
      {issue.timeEntries.length > 0 && (
        <section className="card">
          <h2>Time Entries</h2>
          <div className="time-entries">
            {issue.timeEntries.map(entry => (
              <div key={entry.id} className="time-entry">
                <span className="hours">{entry.hours}h</span>
                <span>{entry.activityName || "Development"}</span>
                <span className="muted">{new Date(entry.spentOn).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
          <p className="total-time">
            Total: {issue.timeEntries.reduce((sum, e) => sum + e.hours, 0)}h
          </p>
        </section>
      )}

      {/* Back */}
      <div className="back-link">
        <Link href="/personal-tickets" className="secondary-button">
          ← Back to Personal Tickets
        </Link>
      </div>

      <style>{`
        .issue-title {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0.5rem 0 0;
        }
        
        .status-chip {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
          background: var(--surface-3);
          color: var(--text);
        }
        
        .status-chip.resolved {
          background: var(--success-light);
          color: var(--success);
        }
        
        .status-chip.in-progress {
          background: var(--accent-light);
          color: var(--accent);
        }
        
        .kv-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        
        .kv-label {
          font-size: 0.75rem;
          color: var(--muted);
          margin-bottom: 0.25rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .kv-value {
          font-size: 0.95rem;
          font-weight: 500;
        }
        
        .description pre {
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          line-height: 1.6;
          margin: 0;
          background: var(--surface-2);
          padding: 1rem;
          border-radius: 6px;
        }
        
        .preserve-whitespace {
          white-space: pre-wrap;
        }
        
        .time-entries {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .time-entry {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: var(--surface-2);
          border-radius: 6px;
        }
        
        .time-entry .hours {
          font-weight: 600;
          min-width: 3rem;
        }
        
        .total-time {
          margin-top: 1rem;
          font-weight: 600;
          color: var(--muted);
        }
        
        .back-link {
          margin-top: 1.5rem;
        }
        
        @media (max-width: 640px) {
          .kv-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </main>
  );
}