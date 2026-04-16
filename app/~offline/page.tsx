"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/src/components/I18nProvider";

export default function OfflinePage() {
  const [online, setOnline] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) {
    return (
      <main className="dashboard">
        <section className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <h1>📡 {t("offline.restored")}</h1>
          <p className="muted">{t("offline.redirecting")}</p>
          <Link href="/" className="primary-link">{t("offline.backToDashboard")}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <section className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <h1>📡 {t("offline.title")}</h1>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {t("offline.cached")}
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <Link href="/" className="primary-link">{t("offline.backToDashboard")}</Link>
        </div>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          {t("offline.tip")}
        </p>
      </section>
    </main>
  );
}
