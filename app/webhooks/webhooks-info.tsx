"use client";

import { useI18n } from "@/src/components/I18nProvider";

interface WebhooksInfoProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    withSecret: number;
    failures: number;
    lastDelivery: string;
  };
  eventCounts: Record<string, number>;
}

export function WebhooksInfo({ stats, eventCounts }: WebhooksInfoProps) {
  const { t } = useI18n();

  return (
    <>
      <section className="ops-grid">
        <article className="card">
          <h2>{t("webhooks.title")}</h2>
          <div className="ops-kv">
            <p><strong>{t("webhooks.totalLabel")}:</strong> {stats.total}</p>
            <p><strong>{t("webhooks.activeLabel")}:</strong> {stats.active}</p>
            <p><strong>{t("webhooks.inactiveLabel")}:</strong> {stats.inactive}</p>
            <p><strong>{t("webhooks.withSecretLabel")}:</strong> {stats.withSecret}</p>
          </div>
        </article>

        <article className="card">
          <h2>{t("webhooks.deliveryStatus")}</h2>
          <div className="ops-kv">
            <p><strong>{t("webhooks.failures")}:</strong> {stats.failures > 0 ? <span className="sync-failed">{stats.failures}</span> : stats.failures}</p>
            <p><strong>{t("webhooks.lastDelivery")}:</strong> {stats.lastDelivery === "Never" ? t("webhooks.never") : stats.lastDelivery}</p>
          </div>
        </article>

        <article className="card">
          <h2>{t("webhooks.eventTypes")}</h2>
          <div className="ops-kv">
            {Object.entries(eventCounts).map(([event, count]) => (
              <p key={event}><strong>{event}:</strong> {count}</p>
            ))}
            {Object.keys(eventCounts).length === 0 && (
              <p className="muted">{t("webhooks.noSubscriptions")}</p>
            )}
          </div>
        </article>
      </section>

      <section className="card">
        <h2>{t("webhooks.availableEventTypes")}</h2>
        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("webhooks.eventLabel")}</th>
                <th>{t("webhooks.descriptionLabel")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>ticket.created</code></td>
                <td>{t("webhooks.newTicketCreated")}</td>
              </tr>
              <tr>
                <td><code>ticket.updated</code></td>
                <td>{t("webhooks.ticketDetailsChanged")}</td>
              </tr>
              <tr>
                <td><code>ticket.status_changed</code></td>
                <td>{t("webhooks.ticketStatusChanged")}</td>
              </tr>
              <tr>
                <td><code>ticket.assigned</code></td>
                <td>{t("webhooks.ticketAssigned")}</td>
              </tr>
              <tr>
                <td><code>ticket.completed</code></td>
                <td>{t("webhooks.ticketCompleted")}</td>
              </tr>
              <tr>
                <td><code>ticket.deleted</code></td>
                <td>{t("webhooks.ticketDeleted")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
