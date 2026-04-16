import { requireRedmineClient } from "@/src/lib/auth";

export async function GET() {
  try {
    const { client } = await requireRedmineClient();
    const projects = await client.listProjects();
    
    return Response.json({ projects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
