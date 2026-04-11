"use client";

import { useState, useMemo } from "react";

interface ReportData {
  label: string;
  value: number | string;
  percentage?: number;
}

interface ReportConfig {
  title: string;
  data: ReportData[];
  type: "table" | "summary";
}

interface CustomReportsProps {
  issues: {
    id: string;
    redmineIssueId: number;
    subject: string;
    statusName: string;
    priorityName?: string;
    projectName?: string;
    assignedToName?: string;
    updatedAt: string;
    dueDate?: string | null;
  }[];
  onExport: (format: "csv" | "json") => void;
}

export function CustomReports({ issues, onExport }: CustomReportsProps) {
  const [activeReport, setActiveReport] = useState<"summary" | "byStatus" | "byPriority" | "byProject">("summary");

  const reports = useMemo((): Record<string, ReportConfig> => {
    // By Status
    const byStatus = new Map<string, number>();
    issues.forEach((i) => {
      byStatus.set(i.statusName, (byStatus.get(i.statusName) ?? 0) + 1);
    });

    // By Priority
    const byPriority = new Map<string, number>();
    issues.forEach((i) => {
      const p = i.priorityName ?? "Unknown";
      byPriority.set(p, (byPriority.get(p) ?? 0) + 1);
    });

    // By Project
    const byProject = new Map<string, number>();
    issues.forEach((i) => {
      const p = i.projectName ?? "Unknown";
      byProject.set(p, (byProject.get(p) ?? 0) + 1);
    });

    return {
      summary: {
        title: "Summary",
        type: "summary",
        data: [
          { label: "Total Issues", value: issues.length },
          { label: "Open Issues", value: issues.filter((i) => !["Closed", "Resolved", "Done"].includes(i.statusName)).length },
          { label: "Closed Issues", value: issues.filter((i) => ["Closed", "Resolved", "Done"].includes(i.statusName)).length },
          { label: "With Due Date", value: issues.filter((i) => i.dueDate).length },
          { label: "Overdue", value: issues.filter((i) => i.dueDate && new Date(i.dueDate) < new Date()).length },
        ],
      },
      byStatus: {
        title: "By Status",
        type: "table",
        data: Array.from(byStatus.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({
            label,
            value,
            percentage: Math.round((value / issues.length) * 100),
          })),
      },
      byPriority: {
        title: "By Priority",
        type: "table",
        data: Array.from(byPriority.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({
            label,
            value,
            percentage: Math.round((value / issues.length) * 100),
          })),
      },
      byProject: {
        title: "By Project",
        type: "table",
        data: Array.from(byProject.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => ({
            label,
            value,
            percentage: Math.round((value / issues.length) * 100),
          })),
      },
    };
  }, [issues]);

  const currentReport = reports[activeReport];

  return (
    <div className="custom-reports">
      <div className="reports-header">
        <h2>📊 Reports</h2>
        <div className="reports-actions">
          <button type="button" onClick={() => onExport("csv")} className="export-btn">
            📥 Export CSV
          </button>
          <button type="button" onClick={() => onExport("json")} className="export-btn">
            📥 Export JSON
          </button>
        </div>
      </div>

      <div className="reports-tabs">
        {Object.entries(reports).map(([key, report]) => (
          <button
            key={key}
            type="button"
            className={`report-tab ${activeReport === key ? "active" : ""}`}
            onClick={() => setActiveReport(key as typeof activeReport)}
          >
            {report.title}
          </button>
        ))}
      </div>

      <div className="report-content">
        <h3>{currentReport.title}</h3>
        {currentReport.type === "summary" ? (
          <div className="report-summary">
            {currentReport.data.map((item) => (
              <div key={item.label} className="summary-card">
                <span className="summary-value">{item.value}</span>
                <span className="summary-label">{item.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>{activeReport === "byStatus" ? "Status" : activeReport === "byPriority" ? "Priority" : "Project"}</th>
                <th>Count</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {currentReport.data.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                  <td>{row.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Export utilities
export function exportToCSV(issues: Record<string, unknown>[], filename: string) {
  if (issues.length === 0) return;
  
  const headers = Object.keys(issues[0]);
  const csv = [
    headers.join(","),
    ...issues.map((row) =>
      headers.map((h) => {
        const val = row[h];
        const str = String(val ?? "");
        return str.includes(",") || str.includes('"') 
          ? `"${str.replace(/"/g, '""')}"` 
          : str;
      }).join(",")
    ),
  ].join("\n");

  downloadFile(csv, `${filename}.csv`, "text/csv");
}

export function exportToJSON(issues: Record<string, unknown>[], filename: string) {
  const json = JSON.stringify(issues, null, 2);
  downloadFile(json, `${filename}.json`, "application/json");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}