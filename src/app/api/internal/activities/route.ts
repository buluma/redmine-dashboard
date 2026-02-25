import { requireRedmineClient } from "@/src/lib/auth";

export async function GET() {
  try {
    const { client } = await requireRedmineClient();
    const activities = await client.getTimeEntryActivities();
    return Response.json({ activities });
  } catch {
    return Response.json({ activities: [] });
  }
}
