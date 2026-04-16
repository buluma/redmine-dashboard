"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/src/components/I18nProvider";

export default function NotFound() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <main className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-illustration">
          <div className="not-found-icon">🔍</div>
          <div className="not-found-code">404</div>
        </div>
        <h1>{t("notFound.title")}</h1>
        <p className="not-found-description">
          {t("notFound.description")}
        </p>
        <div className="not-found-actions">
          <button type="button" className="not-found-btn not-found-btn-secondary" onClick={() => router.back()}>
            ← {t("notFound.goBack")}
          </button>
          <Link href="/" className="not-found-btn not-found-btn-primary">
            {t("notFound.backToDashboard")}
          </Link>
        </div>
        <div className="not-found-help">
          <p>
            <strong>{t("notFound.helpTitle")}</strong> {t("notFound.helpHint")}
          </p>
          <ul>
            <li>{t("notFound.searchDashboard", { link: <Link href="/">{t("notFound.dashboardLink")}</Link> })}</li>
            <li>{t("notFound.checkReports", { link: <Link href="/reports">{t("notFound.reportsLink")}</Link> })}</li>
            <li>{t("notFound.manualSync", { link: <Link href="/ops">{t("notFound.manualSyncLink")}</Link> })}</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
