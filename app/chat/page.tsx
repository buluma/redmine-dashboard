import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { PersonalTicketsDashboard } from "../heimdall/personal-tickets-activity";

export const runtime = "nodejs";

export default async function ChatPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  return (
    <main className="dashboard reports-v2">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">Chats</p>
            <h1>AI Chat</h1>
            <p className="muted">Chat with AI across Redmine and System logs.</p>
          </div>
          <div className="hero-actions">

          </div>
        </div>
      </header>

      <PersonalTicketsDashboard />
    </main>
  );
}
