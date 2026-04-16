"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function AiSummariesEmpty() {
  const { t } = useI18n();
  return (
    <section className="card">
      <div className="reports-head">
        <div>
          <h2>{t('ai.noActivity')}</h2>
          <p className="muted">{t('ai.noActivityDesc')}</p>
        </div>
      </div>
    </section>
  );
}