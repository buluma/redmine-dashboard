"use client";

import React, { useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";
import { PersonalTicketCreateForm } from "./personal-ticket-create-form";
import { usePageSize, PAGE_SIZE_OPTIONS } from "@/src/hooks/usePageSize";
import type { Issue } from "@/src/types/dashboard";

interface PersonalTicketsViewProps {
  issues: Pick<
    Issue,
    "id" | "localIssueNumber" | "subject" | "statusName" | "updatedAt" | "tracker" | "priority" | "doneRatio" | "dueDate"
  >[];
}

export function PersonalTicketsView({ issues }: PersonalTicketsViewProps) {
  const { t, formatDate } = useI18n();
  const { pageSize, setPageSize } = usePageSize(20);
  const [page, setPage] = useState(1);

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    // "Time ago" display — reading the current time at render is the whole
    // point; worst case it's a render behind, no correctness or loop risk.
    // eslint-disable-next-line react-hooks/purity
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return t("personalTickets.timeAgo.m", { count: Math.max(diffMins, 1) });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t("personalTickets.timeAgo.h", { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t("personalTickets.timeAgo.d", { count: diffDays });
  }

  function statusDotClass(statusName: string): string {
    const lower = statusName.toLowerCase();
    if (lower.includes("closed") || lower.includes("done") || lower.includes("resolved")) return "dot-time";
    if (lower.includes("progress") || lower.includes("feedback")) return "dot-time";
    return "dot-comment";
  }

  return (
    <section className="card">
      <details className="collapsible-section" open>
        <summary className="collapsible-summary">
          <div className="collapsible-head">
            <h2>{t("personalTickets.boardTitle")}</h2>
            <p className="muted">{t("personalTickets.boardDesc")}</p>
          </div>
        </summary>

        <div className="ai-overview">
          <PersonalTicketCreateForm />

          {issues.length === 0 && (
            <p className="text-center text-gray-500 py-8">{t("personalTickets.noTickets")}</p>
          )}

          {issues.length > 0 && (() => {
            const total = issues.length;
            const maxPage = Math.max(1, Math.ceil(total / pageSize));
            const safePage = Math.min(page, maxPage);
            const showPager = total > pageSize;
            const start = (safePage - 1) * pageSize;
            const pageIssues = issues.slice(start, start + pageSize);

            return (
            <>
            <div className="heimdall-tickets-feed activity-timeline">
              {pageIssues.map((issue) => (
                <a
                  key={issue.id}
                  href={`/issues/${issue.id}`}
                  className="activity-item"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className={`activity-dot ${statusDotClass(issue.statusName)}`} />
                  <div className="activity-body">
                    <div className="activity-head">
                      <span className="activity-issue">
                        {issue.localIssueNumber != null ? `L-${issue.localIssueNumber}` : "—"} {issue.subject}
                      </span>
                      <span className="activity-time">{formatTimeAgo(issue.updatedAt)}</span>
                    </div>
                    <div className="activity-detail">
                      <span className="activity-type type-comment">{issue.tracker ?? t("personalTickets.ticketDefault")}</span>
                      <span className="activity-note">
                        {issue.statusName} · {issue.priority ?? t("normal")} · {issue.doneRatio ?? 0}%
                      </span>
                      {issue.dueDate && (
                        <span className="activity-note">{t("personalTickets.due", { date: formatDate(issue.dueDate) })}</span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="pagination-bar">
              {showPager && (
                <>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage(1)}
                    disabled={safePage === 1}
                    aria-label="First page"
                  >
                    ««
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    aria-label="Previous page"
                  >
                    «
                  </button>
                </>
              )}
              <span className="pagination-info">
                {showPager && (
                  <>
                    {t('pagination.pageInfo', { current: safePage, max: maxPage })}
                    {" · "}
                  </>
                )}
                {t('pagination.showing', { start: start + 1, end: Math.min(start + pageSize, total), total })}
              </span>
              {showPager && (
                <>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                    disabled={safePage >= maxPage}
                    aria-label="Next page"
                  >
                    »
                  </button>
                  <button
                    type="button"
                    className="pagination-btn"
                    onClick={() => setPage(maxPage)}
                    disabled={safePage >= maxPage}
                    aria-label="Last page"
                  >
                    »»
                  </button>
                </>
              )}
              <label className="pagination-page-size">
                <span className="muted">{t('pagination.perPage', 'Per page')}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) {
                      setPageSize(n);
                      setPage(1);
                    }
                  }}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>
            </div>
            </>
            );
          })()}
        </div>
      </details>
    </section>
  );
}
