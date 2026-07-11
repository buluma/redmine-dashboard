import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";
import { trackFailure } from "@/src/lib/telemetry";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/reports/burndown
 * 
 * Returns burndown chart data for a given date range
 * Query params:
 *   - startDate: ISO date string (default: 14 days ago)
 *   - endDate: ISO date string (default: today)
 *   - projectId: filter by project (optional)
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const projectId = searchParams.get("projectId");
    
    // Default to last 14 days (simulating a 2-week sprint)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    // Get user's issues with status changes in the period
    const where: Prisma.IssueWhereInput = {
      userId: user.id,
      updatedAt: { gte: start },
    };
    
    if (projectId) {
      where.projectName = projectId;
    }
    
    // Fetch issues that were updated in the period
    const issues = await prisma.issue.findMany({
      where,
      select: {
        id: true,
        redmineIssueId: true,
        subject: true,
        projectName: true,
        statusName: true,
        doneRatio: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
    });
    
    // Group by date to track open/closed counts
    const dailyData = new Map<string, { date: string; open: number; closed: number; remaining: number }>();
    
    // Initialize all dates in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0];
      dailyData.set(dateKey, { date: dateKey, open: 0, closed: 0, remaining: 0 });
    }
    
    // Count total issues at start (as "open")
    const totalIssues = issues.length;

    // Build burndown data points
    const sortedDates = Array.from(dailyData.keys()).sort();
    let cumulativeClosed = 0;
    
    const points = sortedDates.map((dateKey, idx) => {
      // Count closed/completed issues on this date
      const issuesOnDate = issues.filter(i => {
        const updated = i.updatedAt instanceof Date 
          ? i.updatedAt.toISOString().split("T")[0] 
          : new Date(i.updatedAt).toISOString().split("T")[0];
        return updated === dateKey && 
          (i.statusName === "Closed" || i.statusName === "Resolved" || i.doneRatio === 100);
      });
      
      cumulativeClosed += issuesOnDate.length;
      const currentRemaining = Math.max(0, totalIssues - cumulativeClosed);
      
      // Ideal burndown line
      const idealRemaining = Math.round(totalIssues - (totalIssues / sortedDates.length) * (idx + 1));
      
      return {
        date: dateKey,
        remaining: currentRemaining,
        ideal: idealRemaining,
        closed: cumulativeClosed,
        new: idx === 0 ? totalIssues : 0, // For velocity tracking
      };
    });
    
    // Calculate velocity (avg issues closed per day in second half)
    const midpoint = Math.floor(points.length / 2);
    const secondHalf = points.slice(midpoint);
    const velocity = secondHalf.length > 0 
      ? secondHalf.reduce((sum, p) => sum + p.closed, 0) / secondHalf.length 
      : 0;
    
    return Response.json({
      sprint: {
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        totalPoints: totalIssues,
        days: points.length,
      },
      points,
      summary: {
        totalIssues,
        totalClosed: points[points.length - 1]?.closed || 0,
        remaining: points[points.length - 1]?.remaining || 0,
        idealRemaining: Math.round(totalIssues / 2),
        velocity: Math.round(velocity * 10) / 10,
        burnRate: totalIssues > 0 
          ? Math.round((points[points.length - 1]?.closed || 0) / totalIssues * 100) 
          : 0,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    trackFailure({ event: "reports.burndown.failed", error, metricName: "reports_burndown_failed" });
    return jsonError("Failed to generate burndown report", 500);
  }
}