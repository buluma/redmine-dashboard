import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { ChatInterface } from "./chat-client";
import { ChatHeader } from "./chat-header";

export const runtime = "nodejs";

export default async function ChatPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  return (
    <main className="dashboard reports-v2">
      <ChatHeader />
      <ChatInterface />
    </main>
  );
}