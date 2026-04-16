import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { z } from "zod";

const reportConfigSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.string(), z.any()).optional(),
  type: z.enum(["time-summary", "burndown", "velocity", "custom"]).optional(),
});

/**
 * GET /api/reports/custom/[id]
 * 
 * Returns a single custom report
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    
    const report = await prisma.customReport.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!report) {
      return jsonError("Report not found", 404);
    }
    
    return Response.json({
      report: {
        id: report.id,
        name: report.name,
        type: report.type,
        config: report.config,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to fetch report", 500);
  }
}

/**
 * PUT /api/reports/custom/[id]
 * 
 * Updates a custom report
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    
    const parsed = reportConfigSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid report config", 400);
    }
    
    // Check ownership
    const existing = await prisma.customReport.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!existing) {
      return jsonError("Report not found", 404);
    }
    
    const report = await prisma.customReport.update({
      where: { id },
      data: parsed.data,
    });
    
    return Response.json({
      report: {
        id: report.id,
        name: report.name,
        type: report.type,
        config: report.config,
        updatedAt: report.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to update report", 500);
  }
}

/**
 * DELETE /api/reports/custom/[id]
 * 
 * Deletes a custom report
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    
    // Check ownership
    const existing = await prisma.customReport.findFirst({
      where: { id, userId: user.id },
    });
    
    if (!existing) {
      return jsonError("Report not found", 404);
    }
    
    await prisma.customReport.delete({
      where: { id },
    });
    
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to delete report", 500);
  }
}