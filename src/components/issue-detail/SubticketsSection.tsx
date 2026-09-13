"use client";

import Link from "next/link";

import { useI18n } from "@/src/components/I18nProvider";

type IssueChild = {
  id: number;
  subject: string;
  statusName?: string | null;
  assignedToName?: string | null;
};

type SubticketsSectionProps = {
  subtickets: IssueChild[];
  formatStatus: (statusName: string) => string;
};

export function SubticketsSection({ subtickets, formatStatus }: SubticketsSectionProps) {
  const { t } = useI18n();

  return (
    <article className="report-card">
      <details className="issue-collapsible">
        <summary>
          {t("issues.sections.subtickets")}
          <span className="muted">({subtickets.length})</span>
        </summary>
        {subtickets.length > 0 ? (
          <div className="children-table-wrap">
            <table className="children-table">
              <thead>
                <tr>
                  <th>{t("issues.colNumber")}</th>
                  <th>{t("issues.subject")}</th>
                  <th>{t("issues.status")}</th>
                  <th>{t("issues.assignee")}</th>
                </tr>
              </thead>
              <tbody>
                {subtickets.map((child) => (
                  <tr key={child.id}>
                    <td>
                      <Link href={`/issues/${child.id}`} className="child-issue-link" target="_blank" rel="noopener noreferrer">
                        #{child.id}
                      </Link>
                    </td>
                    <td className="child-subject">
                      <Link href={`/issues/${child.id}`} target="_blank" rel="noopener noreferrer">
                        {child.subject}
                      </Link>
                    </td>
                    <td className="child-status">
                      {child.statusName ? (
                        <span className="status-chip">{formatStatus(child.statusName)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="child-assignee">
                      {child.assignedToName ?? t("issues.empty.unassigned")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t("issues.empty.subtickets")}</p>
        )}
      </details>
    </article>
  );
}
