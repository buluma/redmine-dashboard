import { prisma } from "@/src/lib/db";
import { requireRedmineClient } from "@/src/lib/auth";
import { RedmineClient } from "@/src/lib/redmine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const { client } = await requireRedmineClient();

    let customFields;
    if (projectId) {
      const pid = parseInt(projectId, 10);
      if (isNaN(pid)) {
        return Response.json({ error: "Invalid project ID" }, { status: 400 });
      }
      customFields = await client.getProjectCustomFields(pid);
    } else {
      customFields = await client.getCustomFields();
    }

    return Response.json({ customFields });
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}