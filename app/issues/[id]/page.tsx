"use client";

import { isLocalOnlyIssue } from "@/src/lib/issue-shape";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";
import { AiIssueActions } from "@/src/components/ai/AiIssueActions";
import { ChatFab } from "@/src/components/ai/ChatFab";
import { QuickActionsPanel } from "@/src/components/QuickActionsPanel";
import { useOfflineAction } from "@/src/hooks/useOfflineAction";
import { useInternalNotes } from "@/src/hooks/useInternalNotes";
import { useIssueDetail, type Issue } from "@/src/hooks/useIssueDetail";
import { useIssueEditDraft } from "@/src/hooks/useIssueEditDraft";
import { useGithubLinkActions } from "@/src/hooks/useGithubLinkActions";
import { AttachmentsSection } from "@/src/components/issue-detail/AttachmentsSection";
import { GithubLinksSection, type GithubLinkCreatePayload } from "@/src/components/issue-detail/GithubLinksSection";
import { IssueActivityTabs, type IssueActivityTab } from "@/src/components/issue-detail/IssueActivityTabs";
import { IssueCommentForm } from "@/src/components/issue-detail/IssueCommentForm";
import { IssueDescriptionSection } from "@/src/components/issue-detail/IssueDescriptionSection";
import { IssueImageLightbox } from "@/src/components/issue-detail/IssueImageLightbox";
import { IssueStandardMetadataFields } from "@/src/components/issue-detail/IssueStandardMetadataFields";
import { IssueOverviewCards } from "@/src/components/issue-detail/IssueOverviewCards";
import { RelationsSection } from "@/src/components/issue-detail/RelationsSection";
import { SubticketsSection } from "@/src/components/issue-detail/SubticketsSection";

function redmineIssueUrl(issue: Pick<Issue, "redmineBaseUrl" | "redmineIssueId">): string | null {
  const baseUrl = issue.redmineBaseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return `${baseUrl}/issues/${issue.redmineIssueId}`;
}

function formatAgo(dateLike: string | undefined | null, t: (key: string, data?: Record<string, string | number>) => string): string {
  if (!dateLike) return "—";
  const ts = new Date(dateLike).getTime();
  if (Number.isNaN(ts)) return "—";
  const deltaSec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (deltaSec < 60) return t("issues.ago.s", { count: deltaSec });
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return t("issues.ago.m", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("issues.ago.h", { count: hours });
  return t("issues.ago.d", { count: Math.floor(hours / 24) });
}

function formatDisplayDate(dateLike: string | null, t: (key: string, data?: Record<string, string | number>) => string): string {
  if (!dateLike) return t("issues.notSet");
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return t("issues.notSet");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function issueActivityAt(issue: Pick<Issue, "lastActivityAt" | "updatedOnRemote">): string {
  return issue.lastActivityAt ?? issue.updatedOnRemote;
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function translateStatusLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.notSet");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    new: "status.new",
    inprogress: "status.inProgress",
    progress: "status.inProgress",
    resolved: "status.resolved",
    feedback: "status.feedback",
    closed: "status.closed",
    rejected: "status.rejected",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

function translatePriorityLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.empty.noPriority");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    low: "priority.low",
    normal: "priority.normal",
    high: "priority.high",
    urgent: "priority.urgent",
    immediate: "priority.immediate",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

function translateTrackerLabel(raw: string | null | undefined, t: (key: string, variables?: Record<string, string | number> | string, fallback?: string) => string): string {
  if (!raw) return t("issues.tracker");
  const normalized = normalizeLookup(raw);
  const map: Record<string, string> = {
    bug: "issues.trackers.bug",
    bugs: "issues.trackers.bugs",
    feature: "issues.trackers.feature",
    features: "issues.trackers.features",
    activity: "issues.trackers.activity",
    activities: "issues.trackers.activities",
    ticket: "issues.trackers.ticket",
    issue: "issues.trackers.issue",
  };
  const key = map[normalized];
  return key ? t(key, raw) : raw;
}

type IssueTab = IssueActivityTab;

function normalizeTab(raw: string | null): IssueTab {
  if (raw === "notes") return "notes";
  if (raw === "internal-notes") return "internal-notes";
  if (raw === "properties") return "properties";
  if (raw === "time_entries") return "time_entries";
  return "history";
}

function IssueLoadingShell() {
  return (
    <main className="dashboard issue-loading-page" aria-busy="true" aria-live="polite">
      <div className="issue-loading-breadcrumb skeleton-line" />

      <header className="card hero issue-hero issue-loading-hero">
        <div className="hero-top issue-loading-hero-top">
          <div className="issue-loading-head">
            <div className="skeleton-line issue-loading-kicker" />
            <div className="skeleton-line issue-loading-title" />
            <div className="skeleton-line issue-loading-subtitle" />
            <div className="issue-loading-chip-row">
              <div className="skeleton-line issue-loading-chip" />
              <div className="skeleton-line issue-loading-chip" />
              <div className="skeleton-line issue-loading-chip" />
            </div>
          </div>
          <div className="issue-loading-actions">
            <div className="skeleton-line issue-loading-action" />
            <div className="skeleton-line issue-loading-action" />
            <div className="skeleton-line issue-loading-action" />
          </div>
        </div>
      </header>

      <section className="quick-actions-panel issue-loading-panel">
        <div className="qa-header">
          <div className="skeleton-line issue-loading-qa-title" />
          <div className="skeleton-line issue-loading-qa-id" />
        </div>
        <div className="qa-meta-row">
          <div className="skeleton-line issue-loading-meta-pill" />
          <div className="skeleton-line issue-loading-meta-pill" />
        </div>
        <div className="qa-content issue-loading-qa-content">
          <div className="skeleton-line issue-loading-input" />
          <div className="skeleton-line issue-loading-input" />
          <div className="skeleton-line issue-loading-submit" />
        </div>
      </section>

      <section className="card reports-shell issue-detail-shell issue-loading-shell">
        <div className="reports-grid issue-overview-grid">
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
          <article className="report-card report-skeleton-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
            <div className="skeleton-line skeleton-foot" />
          </article>
        </div>

        <article className="report-card report-skeleton-card issue-loading-description">
          <div className="skeleton-line skeleton-section-title" />
          <div className="skeleton-chart" />
        </article>

        <div className="issue-tabs issue-loading-tabs">
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
          <div className="skeleton-line issue-loading-tab" />
        </div>

        <article className="report-card report-skeleton-card issue-loading-timeline">
          <div className="skeleton-list">
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
            <div className="skeleton-line skeleton-list-row" />
          </div>
        </article>
      </section>
    </main>
  );
}

export default function IssueDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const issueId = params.id;
  const activeTab = normalizeTab(searchParams.get("tab"));
  const tabFromUrl = searchParams.get("tab");
  const hasScrolledRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const { performAction, isBusy: commentBusy } = useOfflineAction();
  const { t, locale } = useI18n();

  const {
    issue,
    loading,
    error,
    reloadIssue,
    refreshIssueFromRedmine: refreshFromHook,
    refreshBusy,
    aiStatus,
    transitionStatuses,
    activities,
    users,
    priorities,
    customFieldDefs,
    isFavorited,
    toggleFavorite,
    hydratedRelatedIds,
  } = useIssueDetail(issueId, t);

  const {
    notes: internalNotes,
    create: createInternalNote,
    update: updateInternalNote,
    remove: deleteInternalNote,
    busy: noteBusy,
  } = useInternalNotes({
    enabled: activeTab === "internal-notes",
    issueId: issue?.id ?? null,
    onError: (msg) => setActionError(msg),
    onInfo: (msg) => setActionInfo(msg),
    t,
  });

  const {
    editMode,
    editDraft,
    setEditDraft,
    editSaving,
    startEditMode: startEditModeFromHook,
    saveEdit: saveEditFromHook,
    cancelEditMode: cancelEditModeFromHook,
    updateCustomField,
  } = useIssueEditDraft({
    onSaved: reloadIssue,
    onSuccess: setActionInfo,
    onError: setActionError,
    t,
  });

  const {
    busy: githubBusy,
    submitGithubLink: submitGithubLinkFromHook,
    deleteGithubLink: deleteGithubLinkFromHook,
  } = useGithubLinkActions({
    issueId,
    onChanged: reloadIssue,
    onSuccess: setActionInfo,
    onError: setActionError,
    t,
  });

  async function refreshIssueFromRedmine() {
    setActionError(null);
    setActionInfo(null);
    try {
      await refreshFromHook();
      setActionInfo(t("issues.messages.refreshed"));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("issues.messages.refreshed"));
    }
  }

  function startEditMode() {
    if (!issue) return;
    startEditModeFromHook(issue);
    setActionInfo(null);
    setActionError(null);
  }

  async function saveEdit() {
    if (!issue) return;
    setActionError(null);
    await saveEditFromHook(issue);
  }

  function cancelEditMode() {
    cancelEditModeFromHook();
    setActionError(null);
  }

  async function submitGithubLink(payload: GithubLinkCreatePayload): Promise<boolean> {
    setActionError(null);
    setActionInfo(null);
    return submitGithubLinkFromHook(payload);
  }

  async function deleteGithubLink(linkId: string) {
    setActionError(null);
    setActionInfo(null);
    await deleteGithubLinkFromHook(linkId);
  }

  const totalSpent = useMemo(() => {
    if (!issue) return 0;
    return issue.timeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  }, [issue]);

  useEffect(() => {
    if (!issue) {
      return;
    }
    // Skip scroll on first load only when no ?tab= param (default tab)
    // If URL has ?tab=X, scroll so user sees the active tab section
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      if (!tabFromUrl) {
        return;
      }
    }
    tabsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeTab, issue, tabFromUrl]);

  const historyJournals = useMemo(() => {
    if (!issue) return [];
    return issue.journals.filter((journal) => {
      const hasNotes = Boolean(journal.notes?.trim());
      const details = journal.details ?? [];
      // Redmine auto-logs a journal entry every time a sub-issue is linked
      // (child_id changed from (none) to N). On tickets with many children
      // — recurring/hybrid mirrors especially — these entries have no notes
      // and drown out real history, so hide journals that are child_id-only.
      const isChildLinkNoise = details.length > 0 && details.every((d) => d.name === "child_id");
      if (!hasNotes && isChildLinkNoise) return false;
      return hasNotes || details.length > 0;
    });
  }, [issue]);

  const noteJournals = historyJournals;

  const propertyJournals = useMemo(() => {
    if (!issue) return [];
    const propertySignals = /\b(set to|changed|updated|status|priority|assignee|parent|category)\b/i;
    return issue.journals.filter((journal) => propertySignals.test(journal.notes ?? ""));
  }, [issue]);

  const externalIssueUrl = issue ? redmineIssueUrl(issue) : null;
  const breadcrumbItems = issue?.breadcrumbs
    ? issue.breadcrumbs.filter((crumb) => crumb.id !== issue.redmineIssueId)
    : [];
  const redmineBaseForCrumbs = issue?.redmineBaseUrl?.trim().replace(/\/+$/, "") ?? "";

  if (loading) {
    return <IssueLoadingShell />;
  }

  if (error || !issue) {
    return (
      <main className="dashboard">
        <section className="card">
          <h1>{t("common.error")}</h1>
          <p className="muted">{error ?? t("issues.errors.notFound")}</p>
          <div className="row-actions">
            <Link href="/heimdall" className="primary-link">{t("issues.backToDashboard")}</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      {/* Breadcrumb Navigation */}
      {breadcrumbItems.length > 0 && (
        <nav className="breadcrumb-nav">
          <Link href="/" className="breadcrumb-item breadcrumb-home">{t("nav.dashboard")}</Link>
          <span className="breadcrumb-sep">›</span>
          {breadcrumbItems.map((crumb, i) => (
            <span key={crumb.id} className="breadcrumb-chain">
              {crumb.isCached !== false ? (
                <Link href={`/issues/${crumb.id}`} className="breadcrumb-item" target="_blank" rel="noopener noreferrer">
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </Link>
              ) : hydratedRelatedIds.has(crumb.id) ? (
                <Link href={`/issues/${crumb.id}`} className="breadcrumb-item" target="_blank" rel="noopener noreferrer">
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </Link>
              ) : redmineBaseForCrumbs ? (
                <a
                  href={`${redmineBaseForCrumbs}/issues/${crumb.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="breadcrumb-item breadcrumb-external"
                  title={t("issues.tooltips.openInRedmineNotCached")}
                >
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </a>
              ) : (
                <span className="breadcrumb-item breadcrumb-external" title={t("issues.tooltips.notAvailableLocally")}>
                  {crumb.tracker && <span className="breadcrumb-tracker">{crumb.tracker}</span>}
                  #{crumb.id}: {crumb.subject}
                </span>
              )}
              {i < breadcrumbItems.length - 1 && <span className="breadcrumb-sep">›</span>}
            </span>
          ))}
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-item breadcrumb-current">#{issue.redmineIssueId}</span>
        </nav>
      )}
      <header className="card hero issue-hero">
        <div className="hero-top issue-hero-top">
          <div className="issue-heading">
            <p className="kicker">{translateTrackerLabel(issue.tracker, t)}</p>
            <div className="issue-title-line">
              {issue.source === "local" ? (
                <>
                  <span className="source-badge source-local">{t("issues.badges.local")}</span>
                  {issue.localIssueNumber != null && (
                    <span className="redmine-issue-link muted">L-{issue.localIssueNumber}</span>
                  )}
                </>
              ) : (
                externalIssueUrl ? (
                  <a className="redmine-issue-link" href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                    #{issue.redmineIssueId}
                  </a>
                ) : (
                  <span className="redmine-issue-link muted">#{issue.redmineIssueId}</span>
                )
              )}
              {editMode && editDraft ? (
                <input
                  className="edit-title-input"
                  type="text"
                  value={editDraft.subject}
                  onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                  autoFocus
                />
              ) : (
                <h1>{issue.subject}</h1>
              )}
            </div>
            <p className="muted">
              {issue.projectName ?? t("issues.empty.noProject")} • {t("nav.groups.activity")} {formatAgo(issueActivityAt(issue), t)}
            </p>
            {externalIssueUrl && (
              <p className="external-issue-row">
                {t("issues.redmineSource")}
                <a href={externalIssueUrl} target="_blank" rel="noopener noreferrer">
                  {externalIssueUrl}
                </a>
              </p>
            )}
            <div className="chip-row">
              <span className="status-chip active">{translateStatusLabel(issue.statusName, t)}</span>
              <span className="status-chip">{translatePriorityLabel(issue.priority, t)}</span>
              <span className="status-chip">{issue.assignedToName ?? t("issues.empty.unassigned")}</span>
            </div>
            <div className="issue-snapshot-row">
              <div className="issue-snapshot">
                <span>{t("issues.fields.dueDate")}</span>
                <strong>{formatDisplayDate(issue.dueDate, t)}</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.fields.done")}</span>
                <strong>{issue.doneRatio ?? 0}%</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.fields.spentHours")}</span>
                <strong>{totalSpent.toFixed(1)}h</strong>
              </div>
              <div className="issue-snapshot">
                <span>{t("issues.sections.history")}</span>
                <strong>{formatAgo(issueActivityAt(issue), t)}</strong>
              </div>
            </div>
          </div>
          <div className="hero-actions issue-hero-actions">
            {!editMode && issue.source !== "local" && (
              <button type="button" className={`favorite-btn ${isFavorited ? "favorited" : ""}`} onClick={toggleFavorite} title={isFavorited ? t("issues.actions.removeFromFavorites") : t("issues.actions.addToFavorites")}>
                {isFavorited ? t("issues.actions.favorited") : t("issues.actions.favorite")}
              </button>
            )}
            {!editMode && issue.source !== "local" && (
              <button type="button" className="secondary-button issue-refresh-button" onClick={() => void refreshIssueFromRedmine()} disabled={refreshBusy}>
                {refreshBusy ? t("common.loading") : t("issues.actions.refresh")}
              </button>
            )}
            {!editMode && issue.source === "local" && (
              <button
                type="button"
                className="secondary-button issue-delete-button"
                onClick={async () => {
                  if (!confirm(t("issues.actions.confirmDelete", { name: issue.subject }))) return;
                  try {
                    const res = await fetch(`/api/issues/local/${issue.id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(t("issues.messages.noteFailed"));
                    window.location.href = "/";
                  } catch (e) {
                    alert(e instanceof Error ? e.message : t("issues.messages.noteFailed"));
                  }
                }}
              >
                {t("issues.actions.delete")}
              </button>
            )}
            {!editMode && (
              <button type="button" className="primary-link" onClick={startEditMode}>
                {t("issues.actions.edit")}
              </button>
            )}

          </div>
        </div>
      </header>

      {/* Quick Actions Panel — only for Redmine issues */}
      {(issue.redmineIssueId || issue.source === "local") && (
        <QuickActionsPanel
          issueId={issue.redmineIssueId ?? 0}
            currentStatus={translateStatusLabel(issue.statusName, t)}
          currentAssignee={issue.assignedToName ?? undefined}
          onStatusChange={async (statusId) => {
            if (isLocalOnlyIssue(issue)) {
              const statusEntry = transitionStatuses.find((s) => s.id === statusId);
              const res = await fetch(`/api/issues/local/${issue.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statusId, statusName: statusEntry?.name ?? issue.statusName }),
              });
              if (!res.ok) throw new Error("Failed to update status");
              await reloadIssue();
              setActionInfo(t("issues.messages.statusUpdated"));
            } else {
              await performAction({
                type: "update_status",
                issueId,
                redmineBaseUrl: issue.redmineBaseUrl,
                payload: { statusId },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.statusUpdated"),
              });
            }
          }}
          onAssign={async (userId) => {
            if (isLocalOnlyIssue(issue)) {
              const user = users.find((u) => u.id === userId);
              const res = await fetch(`/api/issues/local/${issue.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignedToId: userId, assignedToName: user?.name ?? null }),
              });
              if (!res.ok) throw new Error("Failed to assign");
              await reloadIssue();
              setActionInfo(t("issues.messages.assigned"));
            } else {
              await performAction({
                type: "assign",
                issueId,
                redmineBaseUrl: issue.redmineBaseUrl,
                payload: { userId },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.assigned"),
              });
            }
          }}
          onAddTime={async (hours, comment) => {
            if (isLocalOnlyIssue(issue)) {
              const res = await fetch(`/api/issues/local/${issue.id}/time`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hours, comments: comment }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to log time");
              }
              await reloadIssue();
              setActionInfo(t("issues.messages.timeLogged"));
            } else {
              await performAction({
                type: "log_time",
                issueId,
                redmineBaseUrl: issue.redmineBaseUrl,
                // timeLogSchema (POST /api/issues/[id]/timelog) requires
                // activityId and a singular `comment` — 31 is the known-active
                // Development activity for manual and WakaTime-derived entries.
                payload: { hours, activityId: 31, comment },
                onSuccess: reloadIssue,
                successMessage: t("issues.messages.timeLogged"),
              });
            }
          }}
          statuses={transitionStatuses}
          users={users}
        />
      )}

      <section className="card reports-shell issue-detail-shell">
        <div className="reports-head">
          <div>
            <h2>{t("issues.sections.overview")}</h2>
            <p className="muted">{t("issues.sections.overviewSubtitle")}</p>
          </div>
        </div>

        <IssueOverviewCards
          statusName={issue.statusName}
          priority={issue.priority}
          dueDate={issue.dueDate}
          doneRatio={issue.doneRatio}
          totalSpent={totalSpent}
          assignedToName={issue.assignedToName}
          locale={locale}
          formatStatus={(statusName) => translateStatusLabel(statusName, t)}
          formatPriority={(priority) => translatePriorityLabel(priority, t)}
        />

        <IssueDescriptionSection
          description={issue.description}
          attachments={issue.attachments}
          redmineIssueId={issue.redmineIssueId}
          isEditing={editMode && editDraft !== null}
          editingDescription={editDraft?.description ?? ""}
          onDescriptionChange={(description) => {
            if (editDraft) {
              setEditDraft({ ...editDraft, description });
            }
          }}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
        />

        {/* Issue Metadata Section */}
        {(issue.authorName || issue.categoryName || issue.startDate || issue.estimatedHours || issue.spentHours || (issue.customFieldsJson && issue.customFieldsJson.length > 0)) && (
          <article className="report-card issue-metadata-card">
            <details className="issue-collapsible">
              <summary>{t("issues.sections.metadata")}</summary>
              {editMode && editDraft && (
                <div className="edit-actions">
                  <button type="button" className="edit-save-btn" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? t("common.loading") : t("issues.actions.save")}
                  </button>
                  <button type="button" className="edit-cancel-btn" onClick={cancelEditMode} disabled={editSaving}>
                    {t("issues.actions.cancel")}
                  </button>
                </div>
              )}
              <div className="metadata-grid">
                <IssueStandardMetadataFields
                  isEditing={editMode}
                  draft={editDraft}
                  authorName={issue.authorName}
                  categoryName={issue.categoryName}
                  startDate={issue.startDate}
                  dueDate={issue.dueDate}
                  priority={issue.priority}
                  estimatedHours={issue.estimatedHours}
                  spentHours={issue.spentHours}
                  priorities={priorities}
                  locale={locale}
                  formatPriority={(priority) => translatePriorityLabel(priority, t)}
                  onDraftChange={(field, value) => {
                    if (editDraft) {
                      setEditDraft({ ...editDraft, [field]: value });
                    }
                  }}
                />

                {/* Custom fields with values */}
                {issue.customFieldsJson && issue.customFieldsJson
                  .filter((field) => editMode ? true : (field.value && field.value.trim().length > 0))
                  .map((field) => {
                    // Special handling for "Possible assignee" custom field
                      if (field.name === "Possible assignee") {
                        if (editMode && editDraft) {
                          const assigneeUserId = parseInt(editDraft.customFields[field.id] || "0", 10);
                          return (
                          <div key={field.id} className="metadata-item metadata-item-assignee">
                            <span className="metadata-label">{field.name}</span>
                            <span className="metadata-value">
                              <select
                                className="edit-custom-user-select"
                                value={assigneeUserId || ""}
                                onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              >
                                <option value="">— {t("issues.empty.unset")} —</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </span>
                          </div>
                        );
                      }

                      if (field.value) {
                        const assigneeUserId = parseInt(field.value, 10);
                        const matchedUser = users.find((u) => u.id === assigneeUserId);
                        return (
                          <div key={field.id} className="metadata-item metadata-item-assignee">
                            <span className="metadata-label">{field.name}</span>
                            <span className="metadata-value">
                              {matchedUser ? (
                                <span className="assignee-user">
                                  👤 {matchedUser.name}
                                  <button
                                    type="button"
                                    className="assign-btn"
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/issues/${issueId}/assign`, {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ userId: assigneeUserId }),
                                        });
                                        if (!res.ok) {
                                          const data = await res.json();
                                          throw new Error(data.error || t("issues.messages.assignFailed"));
                                        }
                                        await reloadIssue();
                                        setActionInfo(t("issues.messages.assignedTo", { name: matchedUser.name }));
                                      } catch (e) {
                                        setActionError(e instanceof Error ? e.message : t("issues.messages.assignFailed"));
                                      }
                                    }}
                                    title={t("issues.actions.assignTo", { name: matchedUser.name })}
                                  >
                                    {t("issues.actions.assign")}
                                  </button>
                                </span>
                              ) : (
                                `User #${assigneeUserId}`
                              )}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    }

                    // Get field definition for proper UI rendering
                    const fieldDef = customFieldDefs.find(f => f.id === field.id);
                    const fieldFormat = fieldDef?.fieldFormat ?? "string";
                    const possibleValues = fieldDef?.possibleValues ?? [];
                    const isRequired = fieldDef?.required ?? false;

                    // Editable custom field
                    if (editMode && editDraft) {
                      const isDateField = fieldFormat === "date" || /due\s*date|date|sd\s*due|temp\s*fix/i.test(field.name);
                      const isBoolField = fieldFormat === "bool" || fieldFormat === "checkbox";
                      const isListField = fieldFormat === "list" || fieldFormat === "radio";

                      return (
                        <div key={field.id} className="metadata-item metadata-item-editable">
                          <span className="metadata-label">
                            {field.name}
                            {isRequired && <span className="required-mark">*</span>}
                          </span>
                          {isBoolField ? (
                            <label className="edit-checkbox-label">
                              <input
                                type="checkbox"
                                className="edit-custom-checkbox"
                                checked={editDraft.customFields[field.id] === "1" || editDraft.customFields[field.id] === "true"}
                                onChange={(e) => updateCustomField(String(field.id), e.target.checked ? "1" : "0")}
                              />
                              <span className="checkbox-label-text">{editDraft.customFields[field.id] === "1" || editDraft.customFields[field.id] === "true" ? t("common.yes") : t("common.no")}</span>
                            </label>
                          ) : isListField && possibleValues.length > 0 ? (
                            <select
                              className="edit-custom-select"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                            >
                              <option value="">— {isRequired ? t("issues.actions.select") : t("issues.empty.unset")} —</option>
                              {possibleValues.map((pv) => (
                                <option key={pv.value} value={pv.value}>{pv.value}</option>
                              ))}
                            </select>
                          ) : isDateField ? (
                            <input
                              type="date"
                              className="edit-metadata-input edit-date-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                            />
                          ) : fieldFormat === "int" || fieldFormat === "float" ? (
                            <input
                              type="number"
                              className="edit-metadata-input edit-number-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              step={fieldFormat === "float" ? "0.01" : "1"}
                            />
                          ) : (
                            <input
                              type="text"
                              className="edit-metadata-input"
                              value={editDraft.customFields[field.id] || ""}
                              onChange={(e) => updateCustomField(String(field.id), e.target.value)}
                              placeholder={field.name}
                            />
                          )}
                        </div>
                      );
                    }

                    // Display custom field - use field definition for proper rendering
                    if (field.value && field.value.trim().length > 0) {
                      const isBoolField = fieldFormat === "bool" || fieldFormat === "checkbox";
                      const isListField = fieldFormat === "list" || fieldFormat === "radio";

                      return (
                        <div key={field.id} className="metadata-item">
                          <span className="metadata-label">{field.name}</span>
                          <span className="metadata-value">
                            {isBoolField ? (
                              <span className={`bool-value ${field.value === "1" || field.value === "true" ? "bool-true" : "bool-false"}`}>
                                {field.value === "1" || field.value === "true" ? t("issues.values.trueYes") : t("issues.values.falseNo")}
                              </span>
                            ) : isListField ? (
                              <span className="list-value">{field.value}</span>
                            ) : (
                              field.value
                            )}
                          </span>
                        </div>
                      );
                    }

                    return null;
                  })}
              </div>
            </details>
          </article>
        )}

        {aiStatus?.available && (
          <AiIssueActions
            issueId={issue.id}
            existingSummaries={(issue as unknown as { aiSummaries?: Array<{ id: string; summary: string; model: string; createdAt: string; totalDuration: string | null; loadDuration: string | null; promptEvalCount: number | null; promptEvalDuration: string | null; evalCount: number | null; evalDuration: string | null }> }).aiSummaries ?? []}
          />
        )}

        <SubticketsSection
          subtickets={issue.children}
          formatStatus={(statusName) => translateStatusLabel(statusName, t)}
        />

        <RelationsSection relations={issue.relations} />

        <AttachmentsSection
          attachments={issue.attachments}
          redmineIssueId={issue.redmineIssueId}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
        />

        <GithubLinksSection
          links={issue.githubLinks}
          busy={githubBusy}
          actionError={actionError}
          actionInfo={actionInfo}
          onCreate={submitGithubLink}
          onDelete={deleteGithubLink}
        />

        <IssueCommentForm
          value={comment}
          busy={commentBusy}
          actionError={actionError}
          actionInfo={actionInfo}
          onChange={setComment}
          onSubmit={async () => {
            await performAction({
              type: "comment",
              issueId,
              redmineBaseUrl: issue.redmineBaseUrl,
              payload: { notes: comment },
              onSuccess: () => {
                setComment("");
                void reloadIssue();
              },
              successMessage: "Comment posted to Redmine.",
            });
          }}
        />

        <IssueActivityTabs
          issueId={issue.id}
          redmineIssueId={issue.redmineIssueId}
          attachments={issue.attachments}
          timeEntries={issue.timeEntries}
          historyJournals={historyJournals}
          noteJournals={noteJournals}
          propertyJournals={propertyJournals}
          activeTab={activeTab}
          tabsRef={tabsRef}
          internalNotes={internalNotes}
          noteBusy={noteBusy}
          onCreateInternalNote={createInternalNote}
          onUpdateInternalNote={updateInternalNote}
          onDeleteInternalNote={deleteInternalNote}
          onAddTimeEntry={async (hours, activityId, comments, spentOn) => {
            await performAction({
              type: "log_time",
              issueId,
              redmineBaseUrl: issue.redmineBaseUrl,
              // timeLogSchema expects `comment` (singular), not `comments`.
              payload: { hours, activityId, comment: comments, spentOn },
              onSuccess: reloadIssue,
              successMessage: t("issues.messages.redmineUpdated"),
            });
          }}
          onImageClick={(src, alt) => setLightboxImage({ src, alt })}
          formatAgo={(iso) => formatAgo(iso, t)}
          actionError={actionError}
          activities={activities}
        />
      </section>

      {lightboxImage && <IssueImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}
      {issue.redmineIssueId && <ChatFab issueId={issue.redmineIssueId} />}
    </main>
  );
}
