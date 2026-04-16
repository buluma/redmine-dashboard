import { requireCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { jsonError } from "@/src/lib/http";

/**
 * GET /api/reports/time-export
 * 
 * Export time entries with project breakdown
 * Query params:
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - format: "csv" | "json" (default: json)
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const format = searchParams.get("format") || "json";
    
    // Default to last 30 days
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Fetch time entries with issue and project data
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        spentOn: {
          gte: start,
          lte: end,
        },
      },
      include: {
        issue: {
          select: {
            redmineIssueId: true,
            subject: true,
            projectName: true,
          },
        },
      },
      orderBy: { spentOn: "desc" },
    });
    
    // Group by project
    const byProject = new Map<string, { hours: number; count: number; issues: Set<number> }>();
    let totalHours = 0;
    let totalEntries = 0;
    const uniqueIssues = new Set<number>();
    
    timeEntries.forEach(entry => {
      const project = entry.issue?.projectName || "No Project";
      const existing = byProject.get(project) || { hours: 0, count: 0, issues: new Set() };
      
      existing.hours += entry.hours;
      existing.count += 1;
      if (entry.issue?.redmineIssueId) {
        existing.issues.add(entry.issue.redmineIssueId);
      }
      
      byProject.set(project, existing);
      totalHours += entry.hours;
      totalEntries += 1;
      if (entry.issue?.redmineIssueId) {
        uniqueIssues.add(entry.issue.redmineIssueId);
      }
    });
    
    // Also get WakaTime data for the period (if WakaTime model exists)
    let byWakaProject = new Map<string, number>();
    let totalWakaHours = 0;
    
    try {
      // @ts-ignore - WakaTime model may not exist
      const wakaTimeData = await prisma.wakaTimeEntry?.findMany?.({
        where: {
          userId: user.id,
          date: {
            gte: start,
            lte: end,
          },
        },
        select: {
          hours: true,
          projectName: true,
        },
      }) ?? [];
      
      wakaTimeData.forEach((entry: any) => {
        const project = entry.projectName || "Untracked";
        const existing = byWakaProject.get(project) || 0;
        byWakaProject.set(project, existing + entry.hours);
        totalWakaHours += entry.hours;
      });
    } catch {
      // WakaTime not configured, skip
    }
    
    // Format output
    if (format === "csv") {
      const csvRows = [
        "Project,Total Hours,Entries,Issues,Redmine Hours,WakaTime Hours",
        ...Array.from(byProject.entries()).map(([project, data]) => {
          const wakaHours = byWakaProject.get(project) || 0;
          return `${project},${data.hours.toFixed(2)},${data.count},${data.issues.size},${data.hours.toFixed(2)},${wakaHours.toFixed(2)}`;
        }),
        `TOTAL,${totalHours.toFixed(2)},${totalEntries},${uniqueIssues.size},${totalHours.toFixed(2)},${totalWakaHours.toFixed(2)}`,
      ];
      
      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="time-report-${start.toISOString().split("T")[0]}-${end.toISOString().split("T")[0]}.csv"`,
        },
      });
    }
    
    // JSON response
    return Response.json({
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      summary: {
        totalHours,
        totalEntries,
        uniqueIssues: uniqueIssues.size,
        totalWakaHours,
      },
      byProject: Array.from(byProject.entries()).map(([name, data]) => ({
        name,
        hours: Math.round(data.hours * 100) / 100,
        entries: data.count,
        issues: data.issues.size,
        wakaHours: Math.round((byWakaProject.get(name) || 0) * 100) / 100,
      })),
      byWakaProject: Array.from(byWakaProject.entries()).map(([name, hours]) => ({
        name,
        hours: Math.round(hours * 100) / 100,
      })),
      entries: timeEntries.map(entry => ({
        id: entry.id,
        issueId: entry.issue?.redmineIssueId,
        issueSubject: entry.issue?.subject,
        project: entry.issue?.projectName,
        hours: entry.hours,
        activity: entry.activityName,
        spentOn: entry.spentOn.toISOString().split("T")[0],
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Failed to generate time report", 500);
  }
}