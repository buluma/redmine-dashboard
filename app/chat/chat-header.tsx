"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function ChatHeader() {
  const { t } = useI18n();
  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{t("chat.kicker")}</p>
          <h1>{t("chat.title")}</h1>
          <p className="muted">{t("chat.desc")}</p>
        </div>
      </div>
    </header>
  );
}
