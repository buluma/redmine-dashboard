"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function WebhooksHeader() {
  const { t } = useI18n();
  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{t("webhooks.kicker")}</p>
          <h1>{t("webhooks.title")}</h1>
          <p className="muted">{t("webhooks.subtitle")}</p>
        </div>
        <div className="hero-actions">
          <a href="/webhooks/deliveries" className="secondary-button">
            {t("webhooks.deliveryLogs")}
          </a>
        </div>
      </div>
    </header>
  );
}

export function WebhooksAccessDenied() {
  const { t } = useI18n();
  return (
    <main className="dashboard">
      <section className="card">
        <h1>{t("webhooks.accessDenied")}</h1>
        <p className="muted">{t("webhooks.noPermission")}</p>
        <a href="/" className="secondary-button">{t("webhooks.backToDashboard")}</a>
      </section>
    </main>
  );
}
