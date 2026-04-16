"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n } from "./I18nProvider";

export function OfflineBanner() {
  const { t } = useI18n();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#f59e0b",
        color: "#000",
        textAlign: "center",
        padding: "6px 16px",
        fontSize: "0.82rem",
        fontWeight: 600,
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      📡 {t("offlineBanner.message")}
    </div>
  );
}
