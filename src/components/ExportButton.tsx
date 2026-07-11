"use client";

import { useCallback } from "react";
import { useI18n, type I18nContextType } from "./I18nProvider";
import { issueDisplayId } from "@/src/lib/issue-utils";

interface ExportOptions {
  issues: {
    redmineIssueId: number | null;
    localIssueNumber?: number | null;
    subject: string;
    statusName: string;
    priorityName?: string | null;
    projectName?: string | null;
    assignedToName?: string | null;
    dueDate?: string | null;
    updatedAt: string;
  }[];
  format: "csv" | "print";
}

export function ExportButton({ issues, format }: ExportOptions) {
  const { t, formatDate } = useI18n();

  const handleExport = useCallback(() => {
    if (format === "csv") {
      exportCSV(issues, t, formatDate);
    } else {
      printIssues(issues, t, formatDate);
    }
  }, [issues, format, t, formatDate]);

  return (
    <button type="button" onClick={handleExport} className="export-btn">
      {format === "csv" ? t("export.csvBtn") : t("export.printBtn")}
    </button>
  );
}

function exportCSV(issues: ExportOptions["issues"], t: I18nContextType["t"], formatDate: I18nContextType["formatDate"]) {
  const headers = [
    t("export.colId"),
    t("export.colSubject"),
    t("export.colStatus"),
    t("export.colPriority"),
    t("export.colProject"),
    t("export.colAssignee"),
    t("export.colDue"),
    t("export.colUpdated")
  ];
  const rows = issues.map((i) => [
    issueDisplayId(i),
    `"${i.subject.replace(/"/g, '""')}"`,
    i.statusName,
    i.priorityName ?? "",
    i.projectName ?? "",
    i.assignedToName ?? "",
    i.dueDate ?? "",
    formatDate(i.updatedAt),
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

function printIssues(issues: ExportOptions["issues"], t: I18nContextType["t"], formatDate: I18nContextType["formatDate"]) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${t("export.reportTitle")}</title>
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
  <h1>${t("export.reportTitle")}</h1>
  <p class="print-date">${t("export.generatedAt", { date: new Date().toLocaleString() })}</p>
  <table>
    <thead>
      <tr>
        <th>${t("export.colId")}</th>
        <th>${t("export.colSubject")}</th>
        <th>${t("export.colStatus")}</th>
        <th>${t("export.colPriority")}</th>
        <th>${t("export.colProject")}</th>
        <th>${t("export.colAssignee")}</th>
        <th>${t("export.colDue")}</th>
      </tr>
    </thead>
    <tbody>
      ${issues.map((i) => `
        <tr>
          <td>${issueDisplayId(i)}</td>
          <td>${i.subject}</td>
          <td>${i.statusName}</td>
          <td>${i.priorityName ?? "-"}</td>
          <td>${i.projectName ?? "-"}</td>
          <td>${i.assignedToName ?? "-"}</td>
          <td>${i.dueDate ? formatDate(i.dueDate) : "-"}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <button onclick="window.print()">${t("export.printBtnAction")}</button>
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
