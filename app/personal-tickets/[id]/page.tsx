import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import Link from "next/link";

export const runtime = "nodejs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PersonalTicketPage({ params }: Props) {
  const { id } = await params;
  
  // Get current user
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  // Fetch the issue
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      timeEntries: {
        orderBy: { spentOn: "desc" },
        take: 10,
      },
    },
  });

  // Check if issue exists and belongs to user
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

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Personal Ticket</p>
            <h1>{issue.subject}</h1>
            <p className="muted">
              {issue.localIssueNumber && `Local #${issue.localIssueNumber} • `}
              {issue.tracker || "Task"} • {issue.statusName}
            </p>
          </div>
        </div>
      </header>

      <section className="card">
        <h2>Details</h2>
        <div className="kv-grid">
          <div><p className="kv-label">Status</p><p>{issue.statusName}</p></div>
          <div><p className="kv-label">Priority</p><p>{issue.priority || "-"}</p></div>
          <div><p className="kv-label">Assignee</p><p>{issue.assignedToName || "-"}</p></div>
          <div><p className="kv-label">Due Date</p><p>{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString() : "-"}</p></div>
        </div>
      </section>

      {issue.description && (
        <section className="card">
          <h2>Description</h2>
          <div className="description">
            {issue.description}
          </div>
        </section>
      )}

      {issue.timeEntries.length > 0 && (
        <section className="card">
          <h2>Time Entries</h2>
          <div className="time-entries">
            {issue.timeEntries.map(entry => (
              <div key={entry.id} className="time-entry">
                <span>{entry.hours}h</span>
                <span className="muted">{entry.activityName || "Development"}</span>
                <span className="muted">{new Date(entry.spentOn).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="back-link">
        <Link href="/personal-tickets">← Back to Personal Tickets</Link>
      </div>

      <style>{`
        .kv-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        .kv-label {
          font-size: 0.8rem;
          color: var(--muted);
          margin-bottom: 0.25rem;
        }
        .description {
          white-space: pre-wrap;
          line-height: 1.6;
        }
        .time-entries {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .time-entry {
          display: flex;
          gap: 1rem;
          padding: 0.5rem;
          background: var(--surface-2);
          border-radius: 6px;
        }
        .back-link {
          margin-top: 1.5rem;
        }
      `}</style>
    </main>
  );
}