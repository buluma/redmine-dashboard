import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

function asInt(value: string | null, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return fallback;
  }
  return n;
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, asInt(searchParams.get("limit"), 30)));
    const status = searchParams.get("status");
    const jobType = searchParams.get("jobType");

    const jobs = await prisma.syncJob.findMany({
      where: {
        userId: user.id,
        ...(status ? { status } : {}),
        ...(jobType ? { jobType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      items: jobs.map((job) => ({
        ...job,
        durationMs:
          job.startedAt && job.endedAt ? Math.max(0, job.endedAt.getTime() - job.startedAt.getTime()) : null,
      })),
      total: jobs.length,
      limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch sync jobs";
    const status = message === "Unauthorized" ? 401 : 400;
    return jsonError(message, status);
  }
}
