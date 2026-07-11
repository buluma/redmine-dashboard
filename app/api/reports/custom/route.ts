import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const reportConfigSchema = z.object({
  type: z.enum(["time-summary", "burndown", "velocity", "custom"]),
  name: z.string().min(1),
  config: z.object({
    // Time summary options
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    groupBy: z.enum(["project", "user", "priority", "tracker"]).optional(),
    // Burndown options
    sprintLength: z.number().optional(),
    projectId: z.string().optional(),
    // Custom options
    filters: z.record(z.string(), z.any()).optional(),
    chartType: z.string().optional(),
  }).optional(),
});

/**
 * GET /api/reports/custom
 * 
 * Returns saved custom reports for current user
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    
    const reports = await prisma.customReport.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    
    return Response.json({
      reports: reports.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        config: r.config,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch reports", 500);
  }
}

/**
 * POST /api/reports/custom
 * 
 * Creates a new custom report
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    
    const parsed = reportConfigSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid report config", 400);
    }
    
    const { name, type, config } = parsed.data;
    
    const report = await prisma.customReport.create({
      data: {
        userId: user.id,
        name,
        type,
        config: (config ?? {}) as Prisma.InputJsonValue,
      },
    });
    
    return Response.json({
      report: {
        id: report.id,
        name: report.name,
        type: report.type,
        config: report.config,
        createdAt: report.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to create report", 500);
  }
}