import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { PersonalTicketsDashboard } from "../heimdall/personal-tickets-activity";

export const runtime = "nodejs";

export default async function PersonalTicketsPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  return (
    <main className="dashboard reports-v2">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Tickets</p>
            <h1>Personal Tickets</h1>
            <p className="muted">Track personal work items locally.</p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      <PersonalTicketsDashboard />
    </main>
  );
}
