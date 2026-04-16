"use client";

import { useI18n } from "@/src/components/I18nProvider";

export function UserManagementAccessDenied() {
  const { t } = useI18n();
  return (
    <main className="dashboard">
      <section className="card">
        <h1>{t("ops.accessDenied")}</h1>
        <p className="muted">{t("ops.adminOnly")}</p>
      </section>
    </main>
  );
}
