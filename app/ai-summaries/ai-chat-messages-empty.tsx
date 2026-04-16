"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function AiChatMessagesEmpty() {
  const { t } = useI18n();
  return <p className="muted" style={{ padding: "1rem 0" }}>{t('ai.noChatMessages')}</p>;
}