"use client";

import { useState } from "react";

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
}

interface Props {
  subscriptions: WebhookSubscription[];
}

const EVENT_LABELS: Record<string, string> = {
  "ticket.created": "🎫 Created",
  "ticket.updated": "📝 Updated",
  "ticket.status_changed": "🔄 Status",
  "ticket.assigned": "👤 Assigned",
  "ticket.completed": "✅ Completed",
  "ticket.deleted": "🗑️ Deleted",
};

export function WebhooksClient({ subscriptions }: Props) {
  const [subs, setSubs] = useState(subscriptions);
  const [showForm, setShowForm] = useState(false);
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook subscription?")) return;
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
      alert("Select at least one event");
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
        alert(data.error || "Failed to create webhook");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!confirm("Send test webhook to all active subscribers?")) return;
    setTesting(true);
    try {
      const res = await fetch("/api/webhooks/test", { method: "POST" });
      if (res.ok) {
        alert("Test webhook sent! Check your endpoint logs.");
        fetchSubscriptions();
      } else {
        alert("Failed to send test webhook");
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

  const allEvents = Object.keys(EVENT_LABELS);

  return (
    <>
      {/* Subscriptions Table */}
      <section className="card">
        <div className="table-toolbar">
          <h2>Subscriptions</h2>
          <div className="toolbar-actions">
            <button
              onClick={handleTest}
              disabled={testing || subs.filter(s => s.active).length === 0}
              className="secondary-button"
            >
              {testing ? "Sending..." : "🧪 Test All"}
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="primary-button"
            >
              {showForm ? "✕ Cancel" : "+ Add Subscription"}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="webhook-form">
            <h3>New Webhook Subscription</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Name *</label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My External System"
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="url">Webhook URL *</label>
                  <input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://my-system.com/webhook"
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="secret">Secret (optional, for HMAC signing)</label>
                <input
                  id="secret"
                  type="password"
                  value={formData.secret}
                  onChange={e => setFormData({ ...formData, secret: e.target.value })}
                  placeholder="Leave empty for no signing"
                />
              </div>
              <div className="form-group">
                <label>Events to Subscribe *</label>
                <div className="event-checkboxes">
                  {allEvents.map(event => (
                    <label key={event} className="event-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.events.includes(event)}
                        onChange={() => toggleEvent(event)}
                      />
                      <span>{EVENT_LABELS[event]}</span>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting ? "Creating..." : "Create Subscription"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="drill-table-wrap">
          <table className="issues-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Last Delivery</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No webhook subscriptions yet. Click &quot;Add Subscription&quot; to create one.
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
                      "Never"
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(sub.id)}
                      className="danger-button"
                    >
                      Delete
                    </button>
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