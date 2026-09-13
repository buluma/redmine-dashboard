"use client";

import { useI18n } from "@/src/components/I18nProvider";

type IssueOverviewCardsProps = {
  statusName: string | null;
  priority: string | null;
  dueDate: string | null;
  doneRatio: number | null;
  totalSpent: number;
  assignedToName: string | null;
  locale: string;
  formatStatus: (statusName: string | null) => string;
  formatPriority: (priority: string | null) => string;
};

export function IssueOverviewCards({
  statusName,
  priority,
  dueDate,
  doneRatio,
  totalSpent,
  assignedToName,
  locale,
  formatStatus,
  formatPriority,
}: IssueOverviewCardsProps) {
  const { t } = useI18n();

  return (
    <div className="reports-grid issue-overview-grid">
      <article className="report-card overview-card overview-card-status">
        <p className="report-label">{t("issues.fields.status")}</p>
        <p className="report-value">{formatStatus(statusName)}</p>
        <p className="report-foot">{t("issues.fields.priority")}: {formatPriority(priority)}</p>
      </article>
      <article className="report-card overview-card overview-card-due">
        <p className="report-label">{t("issues.fields.dueDate")}</p>
        <p className="report-value">{dueDate ? new Date(dueDate).toLocaleDateString(locale) : "-"}</p>
        <p className="report-foot">{t("issues.fields.done")}: {doneRatio ?? 0}%</p>
      </article>
      <article className="report-card overview-card overview-card-time">
        <p className="report-label">{t("issues.fields.spentHours")}</p>
        <p className="report-value">{totalSpent.toFixed(1)}h</p>
        <p className="report-foot">{t("issues.fields.assignee")}: {assignedToName ?? t("issues.empty.unassigned")}</p>
      </article>
    </div>
  );
}
