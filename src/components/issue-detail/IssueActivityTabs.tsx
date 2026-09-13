"use client";

import Link from "next/link";
import type { Ref, ReactNode } from "react";

import { useI18n } from "@/src/components/I18nProvider";
import { TimeTrackingPanel } from "@/src/components/TimeTrackingPanel";
import { InternalNotesSection } from "@/src/components/issue-detail/InternalNotesSection";
import { MarkdownBlock } from "@/src/components/issue-detail/MarkdownBlock";
import type { InternalNote } from "@/src/hooks/useInternalNotes";
import type { Attachment } from "@/src/types/dashboard";

export type IssueActivityTab = "history" | "notes" | "internal-notes" | "properties" | "time_entries";

type Journal = {
  id: string;
  author: string | null;
  notes: string | null;
  details?: Array<{ property: string; name: string; old_value: string; new_value: string }>;
  createdOnRemote: string;
};

type TimeEntry = {
  id: string;
  hours: number;
  activityName: string | null;
  authorName: string | null;
  comments: string | null;
  spentOn: string;
};

type IssueActivityTabsProps = {
  issueId: string;
  redmineIssueId: number | null;
  attachments: Attachment[];
  timeEntries: TimeEntry[];
  historyJournals: Journal[];
  noteJournals: Journal[];
  propertyJournals: Journal[];
  activeTab: IssueActivityTab;
  tabsRef: Ref<HTMLDivElement>;
  internalNotes: InternalNote[];
  noteBusy: boolean;
  onCreateInternalNote: (content: string) => Promise<void>;
  onUpdateInternalNote: (noteId: string, content: string) => Promise<void>;
  onDeleteInternalNote: (noteId: string) => Promise<void>;
  onAddTimeEntry: (hours: number, activityId: number, comments: string, spentOn: string) => Promise<void>;
  onImageClick: (src: string, alt: string) => void;
  formatAgo: (iso: string) => string;
  actionError: string | null;
  activities: Array<{ id: number; name: string }>;
};

export function IssueActivityTabs({
  issueId,
  redmineIssueId,
  attachments,
  timeEntries,
  historyJournals,
  noteJournals,
  propertyJournals,
  activeTab,
  tabsRef,
  internalNotes,
  noteBusy,
  onCreateInternalNote,
  onUpdateInternalNote,
  onDeleteInternalNote,
  onAddTimeEntry,
  onImageClick,
  formatAgo,
  actionError,
  activities,
}: IssueActivityTabsProps) {
  const { t } = useI18n();

  const renderMarkdown = (content: string): ReactNode => (
    <MarkdownBlock
      content={content}
      attachments={attachments}
      issueId={redmineIssueId ?? undefined}
      onImageClick={onImageClick}
    />
  );

  return (
    <>
      <div className="issue-tabs" ref={tabsRef}>
        <Link href={`/issues/${issueId}?tab=history`} scroll={false} className={activeTab === "history" ? "active" : ""}>
          {t("issues.tabs.history")}
          <span className="tab-count">{historyJournals.length}</span>
        </Link>
        <Link href={`/issues/${issueId}?tab=notes`} scroll={false} className={activeTab === "notes" ? "active" : ""}>
          {t("issues.tabs.notes")}
          <span className="tab-count">{noteJournals.length}</span>
        </Link>
        <Link href={`/issues/${issueId}?tab=internal-notes`} scroll={false} className={activeTab === "internal-notes" ? "active" : ""}>
          {t("issues.tabs.internalNotes")}
          <span className="tab-count">{internalNotes.length}</span>
        </Link>
        <Link href={`/issues/${issueId}?tab=properties`} scroll={false} className={activeTab === "properties" ? "active" : ""}>
          {t("issues.tabs.properties")}
          <span className="tab-count">{propertyJournals.length}</span>
        </Link>
        <Link href={`/issues/${issueId}?tab=time_entries`} scroll={false} className={activeTab === "time_entries" ? "active" : ""}>
          {t("issues.tabs.timeEntries")}
          <span className="tab-count">{timeEntries.length}</span>
        </Link>
      </div>

      <article className="report-card">
        <p className="report-label">
          {activeTab === "history" && t("issues.tabs.history")}
          {activeTab === "notes" && t("issues.tabs.notes")}
          {activeTab === "properties" && t("issues.tabs.properties")}
          {activeTab === "time_entries" && t("issues.tabs.timeEntries")}
        </p>
        {activeTab === "history" && (
          <div className="timeline">
            {historyJournals.length === 0 && <p className="muted">{t("issues.empty.history")}</p>}
            {historyJournals.map((journal) => (
              <article key={journal.id} className="timeline-item timeline-item-history">
                <p className="muted">
                  <strong>{journal.author ?? t("issues.empty.unknown")}</strong> • {formatAgo(journal.createdOnRemote)}
                </p>
                {journal.notes?.trim() ? renderMarkdown(journal.notes) : null}
                {Array.isArray(journal.details) && journal.details.length > 0 && (
                  <ul className="journal-details">
                    {journal.details.map((detail, index) => (
                      <li key={index}>
                        <strong>{detail.name}</strong> changed from <em>{detail.old_value || "(none)"}</em> to <em>{detail.new_value || "(none)"}</em>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
        {activeTab === "notes" && (
          <div className="timeline">
            {noteJournals.length === 0 && <p className="muted">{t("issues.empty.notes")}</p>}
            {noteJournals.map((journal) => (
              <article key={journal.id} className="timeline-item timeline-item-note">
                <p className="muted">
                  <strong>{journal.author ?? t("issues.empty.unknown")}</strong> • {formatAgo(journal.createdOnRemote)}
                </p>
                {renderMarkdown(journal.notes ?? "")}
              </article>
            ))}
          </div>
        )}
        {activeTab === "internal-notes" && (
          <InternalNotesSection
            notes={internalNotes}
            busy={noteBusy}
            onCreate={onCreateInternalNote}
            onUpdate={onUpdateInternalNote}
            onDelete={onDeleteInternalNote}
            renderMarkdown={renderMarkdown}
            formatAgo={formatAgo}
            actionError={actionError}
          />
        )}
        {activeTab === "properties" && (
          <div className="timeline">
            {propertyJournals.length === 0 && <p className="muted">{t("issues.empty.properties")}</p>}
            {propertyJournals.map((journal) => (
              <article key={journal.id} className="timeline-item timeline-item-property">
                <p className="muted">
                  <strong>{journal.author ?? t("issues.empty.unknown")}</strong> • {formatAgo(journal.createdOnRemote)}
                </p>
                {renderMarkdown(journal.notes ?? "")}
              </article>
            ))}
          </div>
        )}
        {activeTab === "time_entries" && (
          <div className="time-entries-section">
            <TimeTrackingPanel
              entries={timeEntries.map((entry) => ({
                id: entry.id,
                hours: entry.hours,
                comments: entry.comments,
                activityName: entry.activityName || t("issues.empty.general"),
                spentOn: entry.spentOn,
                authorName: entry.authorName || t("issues.empty.unknown"),
              }))}
              onAddEntry={onAddTimeEntry}
              activities={activities}
              isLoading={false}
            />
          </div>
        )}
      </article>
    </>
  );
}
