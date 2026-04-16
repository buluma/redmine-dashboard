"use client";

import { useState, useMemo } from "react";
import { useI18n } from "@/src/components/I18nProvider";

interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: Date | string;
  createdBy: string;
  lastTriggeredAt: Date | string | null;
  lastStatus: number | null;
  failureCount: number;
  secret?: string;
}

interface Props {
  subscriptions: WebhookSubscription[];
}

export function WebhooksClient({ subscriptions }: Props) {
  const { t } = useI18n();
  const [subs, setSubs] = useState(subscriptions);

  const eventLabels: Record<string, string> = useMemo(() => ({
    "ticket.created": t("webhooks.eventTicketCreated"),
    "ticket.updated": t("webhooks.eventTicketUpdated"),
    "ticket.status_changed": t("webhooks.eventTicketStatus"),
    "ticket.assigned": t("webhooks.eventTicketAssigned"),
    "ticket.completed": t("webhooks.eventTicketCompleted"),
    "ticket.deleted": t("webhooks.eventTicketDeleted"),
  }), [t]);

  const allEvents = useMemo(() => Object.keys(eventLabels), [eventLabels]);
  const [showForm, setShowForm] = useState(false);
  const [editingSub, setEditingSub] = useState<WebhookSubscription | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    secret: "",
    events: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchSubscriptions = async () => {
    const res = await fetch("/api/webhooks/subscriptions");
    if (res.ok) {
      const data = await res.json();
      setSubs(data);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const res = await fetch(`/api/webhooks/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (res.ok) {
      setSubs(prev => prev.map(s => s.id === id ? { ...s, active } : s));
    }
  };

  const handleEdit = (sub: WebhookSubscription) => {
    setEditingSub(sub);
    setFormData({
      name: sub.name,
      url: sub.url,
      secret: "",
      events: sub.events,
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.events.length === 0) {
      alert(t("webhooks.selectOneEvent"));
      return;
    }
    if (!formData.name.trim() || !formData.url) {
      alert(t("webhooks.nameUrlRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${editingSub?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingSub(null);
        setFormData({ name: "", url: "", secret: "", events: [] });
        fetchSubscriptions();
      } else {
        const data = await res.json();
        alert(data.error || t("webhooks.updateFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingSub(null);
    setFormData({ name: "", url: "", secret: "", events: [] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("webhooks.confirmDelete"))) return;
    const res = await fetch(`/api/webhooks/subscriptions/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSubs(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.events.length === 0) {
      alert(t("webhooks.selectOneEvent"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/webhooks/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowForm(false);
        setFormData({ name: "", url: "", secret: "", events: [] });
        fetchSubscriptions();
      } else {
        const data = await res.json();
        alert(data.error || t("webhooks.createFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!confirm(t("webhooks.confirmTest"))) return;
    setTesting(true);
    try {
      const res = await fetch("/api/webhooks/test", { method: "POST" });
      if (res.ok) {
        alert(t("webhooks.testSent"));
        fetchSubscriptions();
      } else {
        alert(t("webhooks.testFailed"));
      }
    } finally {
      setTesting(false);
    }
  };

  const toggleEvent = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event],
    }));
  };

  return (
    <>
      {/* Subscriptions Table */}
      <section className="card">
        <div className="table-toolbar">
          <h2>{t("webhooks.title")}</h2>
          <div className="toolbar-actions">
            <button
              onClick={handleTest}
              disabled={testing || subs.filter(s => s.active).length === 0}
              className="secondary-button"
            >
              {testing ? t("webhooks.sending") : t("webhooks.testAll")}
            </button>
            {editingSub ? (
              <button onClick={handleCancelEdit} className="secondary-button">
                {t("webhooks.cancelEdit")}
              </button>
            ) : (
              <button
                onClick={() => setShowForm(!showForm)}
                className="primary-button"
              >
                {showForm ? t("webhooks.cancel") : t("webhooks.addSubscription")}
              </button>
            )}
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="webhook-form">
            <h3>{t("webhooks.newWebhook")}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">{t("webhooks.nameLabel")}</label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("webhooks.namePlaceholder")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="url">{t("webhooks.urlLabel")}</label>
                  <input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                    placeholder={t("webhooks.urlPlaceholder")}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="secret">{t("webhooks.secretLabel")}</label>
                <input
                  id="secret"
                  type="password"
                  value={formData.secret}
                  onChange={e => setFormData({ ...formData, secret: e.target.value })}
                  placeholder={t("webhooks.secretPlaceholder")}
                />
              </div>
              <div className="form-group">
                <label>{t("webhooks.eventsLabel")}</label>
                <div className="event-checkboxes">
                  {allEvents.map(event => (
                    <label key={event} className="event-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(event)}
                        onChange={() => toggleEvent(event)}
                      />
                      <span>{eventLabels[event]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="secondary-button"
                >
                  {t("webhooks.cancel")}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting ? t("webhooks.creatingBtn") : t("webhooks.createBtn")}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Form */}
        {editingSub && (
          <div className="webhook-form">
            <h3>{t("webhooks.editWebhook", { name: editingSub.name })}</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-name">{t("webhooks.nameLabel")}</label>
                  <input
                    id="edit-name"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("webhooks.namePlaceholder")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-url">{t("webhooks.urlLabel")}</label>
                  <input
                    id="edit-url"
                    type="url"
                    value={formData.url}
                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                    placeholder={t("webhooks.urlPlaceholder")}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="edit-secret">{t("webhooks.secretEditLabel")}</label>
                <input
                  id="edit-secret"
                  type="password"
                  value={formData.secret}
                  onChange={e => setFormData({ ...formData, secret: e.target.value })}
                  placeholder={t("webhooks.secretEditPlaceholder")}
                />
              </div>
              <div className="form-group">
                <label>{t("webhooks.eventsLabelShort")}</label>
                <div className="event-checkboxes">
                  {allEvents.map(event => (
                    <label key={event} className="event-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(event)}
                        onChange={() => toggleEvent(event)}
                      />
                      <span>{eventLabels[event]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={handleCancelEdit} className="secondary-button">
                  {t("webhooks.cancel")}
                </button>
                <button type="submit" disabled={submitting} className="primary-button">
                  {submitting ? t("webhooks.savingBtn") : t("webhooks.saveBtn")}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>{t("webhooks.tableName")}</th>
                <th>{t("webhooks.tableUrl")}</th>
                <th>{t("webhooks.tableEvents")}</th>
                <th>{t("webhooks.tableStatus")}</th>
                <th>{t("webhooks.tableLast")}</th>
                <th>{t("webhooks.tableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {t("webhooks.noSubscriptions")}
                  </td>
                </tr>
              )}
              {subs.map(sub => (
                <tr key={sub.id} className={sub.active ? "" : "muted"}>
                  <td><strong>{sub.name}</strong></td>
                  <td>
                    <a href={sub.url} target="_blank" rel="noopener noreferrer" className="external-link">
                      {sub.url.length > 40 ? sub.url.substring(0, 40) + "..." : sub.url}
                    </a>
                  </td>
                  <td>
                    <div className="event-badges">
                      {sub.events.map(event => (
                        <span key={event} className="event-badge">
                          {EVENT_LABELS[event] || event}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={sub.active}
                        onChange={e => handleToggle(sub.id, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </td>
                  <td className="muted">
                    {sub.lastTriggeredAt ? (
                      <span className={sub.lastStatus && sub.lastStatus >= 200 && sub.lastStatus < 300 ? "sync-success" : "sync-failed"}>
                        {sub.lastStatus || "-"}
                      </span>
                    ) : (
                      t("webhooks.never")
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        onClick={() => handleEdit(sub)}
                        className="secondary-button btn-sm"
                        disabled={editingSub !== null}
                      >
                        {t("webhooks.edit")}
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id)}
                        className="danger-button btn-sm"
                      >
                        {t("webhooks.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        .webhook-form {
          background: var(--surface-2);
          padding: 1.5rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }
        
        .webhook-form h3 {
          margin: 0 0 1rem;
          color: var(--accent);
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        
        .form-group {
          margin-bottom: 1rem;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
        }
        
        .form-group input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.9rem;
          background: var(--bg);
        }
        
        .event-checkboxes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 0.5rem;
        }
        
        .event-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
        }
        
        .form-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1rem;
        }
        
        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }
        
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.8rem;
        }
        
        .event-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }
        
        .event-badge {
          padding: 0.125rem 0.5rem;
          background: var(--accent-light);
          color: var(--accent);
          border-radius: 9999px;
          font-size: 0.75rem;
        }
        
        .toolbar-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .primary-button {
          background: var(--accent);
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .primary-button:hover {
          opacity: 0.9;
        }
        
        .primary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .secondary-button {
          background: var(--surface-2);
          color: var(--text);
          border: 1px solid var(--border);
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }
        
        .secondary-button:hover {
          background: var(--surface-3);
        }
        
        .secondary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .danger-button {
          background: var(--sync-failed);
          color: white;
          border: none;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        
        .danger-button:hover {
          opacity: 0.9;
        }
        
        .toggle {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 22px;
        }
        
        .toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: var(--border);
          border-radius: 22px;
          transition: 0.2s;
        }
        
        .toggle-slider::before {
          content: "";
          position: absolute;
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: 0.2s;
        }
        
        .toggle input:checked + .toggle-slider {
          background-color: var(--sync-success);
        }
        
        .toggle input:checked + .toggle-slider::before {
          transform: translateX(18px);
        }
        
        .external-link {
          color: var(--accent);
          font-size: 0.85rem;
        }
        
        tr.muted td {
          opacity: 0.5;
        }
      `}</style>
    </>
  );
}