"use client";

import React from "react";
import { useI18n } from "@/src/components/I18nProvider";
import { PersonalTicketCreateForm } from "./personal-ticket-create-form";

interface PersonalTicketsViewProps {
  issues: any[];
}

export function PersonalTicketsView({ issues }: PersonalTicketsViewProps) {
  const { t, formatDate } = useI18n();

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
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

          {issues.length > 0 && (
            <div className="heimdall-tickets-feed activity-timeline">
              {issues.map((issue) => (
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
          )}
        </div>
      </details>
    </section>
  );
}
