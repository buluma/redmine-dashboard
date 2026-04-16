import { redirect } from "next/navigation";
import { getSessionUserId } from "@/src/lib/session";
import { PersonalTicketsDashboard } from "../heimdall/personal-tickets-activity";
import { PersonalTicketsHeader } from "./personal-tickets-header";

export const runtime = "nodejs";

export default async function PersonalTicketsPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/");
  }

  return (
    <main className="dashboard reports-v2">
      <PersonalTicketsHeader />
      <PersonalTicketsDashboard />
    </main>
  );
}
