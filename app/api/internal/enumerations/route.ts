import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") || "issue_priority";
    
    const items = await prisma.enumerationCatalog.findMany({
      where: { kind, isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    
    return Response.json({ items });
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Server error" }, { status });
  }
}
