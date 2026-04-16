"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function PersonalTicketsHeader() {
  const { t } = useI18n();
  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{t("personalTickets.kicker")}</p>
          <h1>{t("personalTickets.title")}</h1>
          <p className="muted">{t("personalTickets.desc")}</p>
        </div>
        <div className="hero-actions">
        </div>
      </div>
    </header>
  );
}
