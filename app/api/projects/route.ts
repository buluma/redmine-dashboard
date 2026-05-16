import { requireRedmineClient } from "@/src/lib/auth";
import { trackFailure } from "@/src/lib/telemetry";

export async function GET() {
  try {
    const { client } = await requireRedmineClient();
    const projects = await client.listProjects();

    return Response.json({ projects });
  } catch (error) {
    trackFailure({ event: "projects.list.failed", error, metricName: "projects_list_failed" });
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
