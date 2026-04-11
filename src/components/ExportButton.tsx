"use client";

import { useCallback } from "react";

interface ExportOptions {
  issues: {
    redmineIssueId: number;
    subject: string;
    statusName: string;
    priorityName?: string;
    projectName?: string;
    assignedToName?: string;
    dueDate?: string | null;
    updatedAt: string;
  }[];
  format: "csv" | "print";
}

export function ExportButton({ issues, format }: ExportOptions) {
  const handleExport = useCallback(() => {
    if (format === "csv") {
      exportCSV(issues);
    } else {
      printIssues(issues);
    }
  }, [issues, format]);

  return (
    <button type="button" onClick={handleExport} className="export-btn">
      {format === "csv" ? "📥 CSV" : "🖨️ Print"}
    </button>
  );
}

function exportCSV(issues: ExportOptions["issues"]) {
  const headers = ["ID", "Subject", "Status", "Priority", "Project", "Assignee", "Due Date", "Updated"];
  const rows = issues.map((i) => [
    i.redmineIssueId,
    `"${i.subject.replace(/"/g, '""')}"`,
    i.statusName,
    i.priorityName ?? "",
    i.projectName ?? "",
    i.assignedToName ?? "",
    i.dueDate ?? "",
    new Date(i.updatedAt).toLocaleDateString(),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `issues-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printIssues(issues: ExportOptions["issues"]) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Issues Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    h1 { margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
    th { background: #f5f5f5; }
    tr:nth-child(even) { background: #fafafa; }
    .print-date { color: #666; margin-bottom: 1rem; }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <h1>Issues Report</h1>
  <p class="print-date">Generated: ${new Date().toLocaleString()}</p>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Subject</th>
        <th>Status</th>
        <th>Priority</th>
        <th>Project</th>
        <th>Assignee</th>
        <th>Due Date</th>
      </tr>
    </thead>
    <tbody>
      ${issues.map((i) => `
        <tr>
          <td>#${i.redmineIssueId}</td>
          <td>${i.subject}</td>
          <td>${i.statusName}</td>
          <td>${i.priorityName ?? "-"}</td>
          <td>${i.projectName ?? "-"}</td>
          <td>${i.assignedToName ?? "-"}</td>
          <td>${i.dueDate ? new Date(i.dueDate).toLocaleDateString() : "-"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <button onclick="window.print()">Print</button>
  <script>window.onload = () => window.print();</script>
</body>
</html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
