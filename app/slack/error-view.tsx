"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function SlackErrorView({ error }: { error: string }) {
  const { t } = useI18n();
  
  let translatedError = error;
  if (error.includes("Slack bot token not configured")) {
    translatedError = t("slack.botTokenError");
  } else if (error.includes("No Slack channels configured")) {
    translatedError = t("slack.noChannels");
  } else if (error.includes("Failed to fetch Slack messages")) {
    translatedError = t("slack.fetchFailed");
  }

  return (
    <>
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("slack.kicker")}</p>
            <h1>{t("slack.title")}</h1>
            <p className="muted">{t("slack.configRequired")}</p>
          </div>
        </div>
      </header>
      <section className="card">
        <div className="reports-head">
          <div>
            <h2>{t("slack.configError")}</h2>
            <p className="muted">{translatedError}</p>
          </div>
        </div>
      </section>
    </>
  );
}
