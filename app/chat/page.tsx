import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { ChatInterface } from "./chat-client";

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
            <p className="kicker">Chat</p>
            <h1>AI Assistant</h1>
            <p className="muted">Chat with AI about your Redmine issues and system logs.</p>
          </div>
        </div>
      </header>

      <ChatInterface />
    </main>
  );
}