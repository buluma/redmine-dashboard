"use client";

import { useI18n } from "@/src/components/I18nProvider";

interface WakatimeErrorViewProps {
  apiKey: string | undefined;
  error: string | null;
  allTimeText?: string;
}

export function WakatimeErrorView({ apiKey, error, allTimeText }: WakatimeErrorViewProps) {
  const { t } = useI18n();

  const isConfigError = !apiKey;

  return (
    <>
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("wakatime.kicker")}</p>
            <h1>{t("wakatime.title")}</h1>
            <p className="muted">
              {allTimeText 
                ? `${t("wakatime.poweredBy")} · ${allTimeText} ${t("wakatime.totalTime")}` 
                : t("wakatime.poweredBy")}
            </p>
          </div>
        </div>
      </header>

      <section className="card">
        <div className="reports-head">
          <div>
            {isConfigError ? (
              <>
                <h2>⚠️ {t("wakatime.notConfigured")}</h2>
                <p className="muted">
                  {t("wakatime.apiKeyHelp")} Get your API key at{" "}
                  <a href="https://wakatime.com/api-key" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #e63946)" }}>
                    wakatime.com/api-key
                  </a>.
                </p>
              </>
            ) : (
              <>
                <h2>⚠️ {t("wakatime.errorLoading")}</h2>
                <p className="muted" style={{ maxWidth: "600px" }}>
                  {error?.includes("401") || error?.includes("invalid") || error?.includes("Unauthorized")
                    ? t("wakatime.invalidKey")
                    : error?.includes("rate limit")
                      ? t("wakatime.rateLimit")
                      : error?.includes("calculating")
                        ? t("wakatime.calculating")
                        : `${t("common.error")}: ${error}`}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
