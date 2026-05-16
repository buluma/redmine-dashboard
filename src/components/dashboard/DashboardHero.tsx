"use client";

import type { ReactNode } from "react";

import { useI18n } from "@/src/components/I18nProvider";

export interface DashboardHeroStats {
  totalVisible: number;
  total: number;
  dueToday: number;
  avgOpenAgeDays: number;
  open: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
  completion: number;
  done: number;
  avgDoneRatio: number;
  blocked: number;
  stale: number;
}

interface DashboardHeroProps {
  stats: DashboardHeroStats;
  aiSummaryCount: number;
  loading: boolean;
  manualRefreshBusy: boolean;
  showAllMetrics: boolean;
  onManualPull: () => void;
  onResetFilters: () => void;
  onOpenShortcuts: () => void;
  onToggleAllMetrics: () => void;
  aiStatusIndicator: ReactNode;
}

export function DashboardHero({
  stats,
  aiSummaryCount,
  loading,
  manualRefreshBusy,
  showAllMetrics,
  onManualPull,
  onResetFilters,
  onOpenShortcuts,
  onToggleAllMetrics,
  aiStatusIndicator,
}: DashboardHeroProps) {
  const { t } = useI18n();
  const progressPct = Math.min(
    100,
    Math.round((stats.totalVisible / Math.max(1, stats.total)) * 100),
  );

  return (
    <section className="card home-hero-support">
      <div className="hero-actions">
        {aiStatusIndicator}
        <span style={{ flex: "1" }} />
        <button
          className="secondary-button"
          type="button"
          onClick={onManualPull}
          disabled={manualRefreshBusy}
        >
          {manualRefreshBusy ? t("hero.refreshing") : t("hero.forceRefresh")}
        </button>
        <button className="secondary-button" type="button" onClick={onResetFilters}>
          {t("hero.resetFilters")}
        </button>
        <button className="secondary-button" type="button" onClick={onOpenShortcuts}>
          {t("hero.shortcutsBtn")}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onToggleAllMetrics}
          aria-expanded={showAllMetrics}
          aria-controls="metrics-grid"
        >
          {showAllMetrics
            ? t("metrics.collapseAll", "Show less")
            : t("metrics.expandAll", "All metrics")}
        </button>
      </div>

      <section
        id="metrics-grid"
        className={`metrics-grid${loading ? " metrics-loading" : ""}${
          showAllMetrics ? "" : " metrics-grid-compact"
        }`}
      >
        <article className="card metric-card metric-primary">
          <p className="metric-label">{t("metrics.visibleTotalLabel")}</p>
          <p className="metric-value">
            {stats.totalVisible} <span>/ {stats.total}</span>
          </p>
          <div className="progress-track">
            <span className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="metric-signal-row">
            <span>{t("metrics.dueTodayInfo", { count: stats.dueToday })}</span>
            <span>{t("metrics.avgOpenAgeInfo", { days: stats.avgOpenAgeDays })}</span>
          </div>
        </article>
        <article className="card metric-card metric-open">
          <p className="metric-label">{t("metrics.openLabel")}</p>
          <p className="metric-value">{stats.open}</p>
          <p className="metric-foot">{t("metrics.inProgressFoot", { count: stats.inProgress })}</p>
        </article>
        <article className="card metric-card metric-risk">
          <p className="metric-label">{t("metrics.riskBucketLabel")}</p>
          <p className="metric-value">{stats.overdue}</p>
          <p className="metric-foot">{t("metrics.riskFoot", { count: stats.dueSoon })}</p>
        </article>
        {showAllMetrics && (
          <>
            <article className="card metric-card metric-health">
              <p className="metric-label">{t("metrics.deliveryHealthLabel")}</p>
              <p className="metric-value">{stats.completion}%</p>
              <p className="metric-foot">
                {t("metrics.deliveryHealthFoot", {
                  done: stats.done,
                  ratio: stats.avgDoneRatio,
                })}
              </p>
            </article>
            <article className="card metric-card metric-blocked">
              <p className="metric-label">{t("metrics.blockedLabel")}</p>
              <p className="metric-value">{stats.blocked}</p>
              <p className="metric-foot">{t("metrics.blockedFoot")}</p>
            </article>
            <article className="card metric-card metric-stale">
              <p className="metric-label">{t("metrics.staleQueueLabel")}</p>
              <p className="metric-value">{stats.stale}</p>
              <p className="metric-foot">
                {t("metrics.staleQueueFoot", { days: stats.avgOpenAgeDays })}
              </p>
            </article>
            <article className="card metric-card metric-ai-insights">
              <p className="metric-label">{t("metrics.aiInsightsLabel")}</p>
              <p className="metric-value">{aiSummaryCount}</p>
              <p className="metric-foot">{t("ai.insightsCount", { count: aiSummaryCount })}</p>
            </article>
          </>
        )}
      </section>
    </section>
  );
}
