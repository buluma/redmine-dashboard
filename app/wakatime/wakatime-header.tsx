"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function WakatimeHeader({ allTimeText }: { allTimeText?: string }) {
  const { t } = useI18n();
  return (
    <header className="card hero">
      <div className="hero-top">
        <div>
          <p className="kicker">{t("wakatime.kicker")}</p>
          <h1>{t("wakatime.title")}</h1>
          <p className="muted">
            {t("wakatime.poweredBy")} · {allTimeText ?? "—"} {t("wakatime.totalTime")}
          </p>
        </div>
      </div>
    </header>
  );
}
