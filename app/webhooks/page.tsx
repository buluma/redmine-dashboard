"use client";

import { useEffect, useState } from "react";

interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  createdBy: string;
  lastTriggeredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
}

const EVENT_LABELS: Record<string, string> = {
  "ticket.created": "🎫 Ticket Created",
  "ticket.updated": "📝 Ticket Updated",
  "ticket.status_changed": "🔄 Status Changed",
  "ticket.assigned": "👤 Assigned",
  "ticket.completed": "✅ Completed",
  "ticket.deleted": "🗑️ Deleted",
};

export default function WebhooksPage() {
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    secret: "",
    events: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch("/api/webhooks/subscriptions");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSubscriptions(data);
    } catch (err) {
      setError("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, active } : s))
        );
      }
    } catch {
      alert("Failed to toggle webhook");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this webhook subscription?")) return;
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      alert("Failed to delete webhook");
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
    } catch {
      alert("Failed to create webhook");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTest = async () => {
    if (!confirm("Send test webhook to all active subscribers?")) return;
    try {
      const res = await fetch("/api/webhooks/test", { method: "POST" });
      if (res.ok) {
        alert("Test webhook sent! Check your endpoint logs.");
      } else {
        alert("Failed to send test webhook");
      }
    } catch {
      alert("Failed to send test webhook");
    }
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const allEvents = Object.keys(EVENT_LABELS);

  return (
    <main className="dashboard webhooks-page">
      <header className="page-header">
        <div>
          <h1>🔗 Webhook Subscriptions</h1>
          <p>Manage external endpoints that receive ticket events</p>
        </div>
        <div className="header-actions">
          <button onClick={handleTest} className="btn btn-secondary">
            🧪 Test All
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? "✕ Cancel" : "+ Add Subscription"}
          </button>
        </div>
      </header>

      {showForm && (
        <div className="card webhook-form">
          <h2>New Webhook Subscription</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://my-system.com/webhook"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="secret">
                Secret (optional, for HMAC signing)
              </label>
              <input
                id="secret"
                type="password"
                value={formData.secret}
                onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                placeholder="Leave empty for no signing"
              />
            </div>

            <div className="form-group">
              <label>Events to Subscribe *</label>
              <div className="event-checkboxes">
                {allEvents.map((event) => (
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
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? "Creating..." : "Create Subscription"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading webhooks...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : subscriptions.length === 0 ? (
        <div className="empty-state card">
          <h3>No webhook subscriptions</h3>
          <p>Add a subscription to start receiving ticket events.</p>
        </div>
      ) : (
        <div className="webhook-list">
          {subscriptions.map((sub) => (
            <div key={sub.id} className={`card webhook-card ${sub.active ? "" : "inactive"}`}>
              <div className="webhook-header">
                <div className="webhook-info">
                  <h3>{sub.name}</h3>
                  <a href={sub.url} target="_blank" rel="noopener noreferrer" className="webhook-url">
                    {sub.url}
                  </a>
                </div>
                <div className="webhook-status">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={sub.active}
                      onChange={(e) => handleToggle(sub.id, e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="webhook-events">
                {sub.events.map((event) => (
                  <span key={event} className="event-badge">
                    {EVENT_LABELS[event] || event}
                  </span>
                ))}
              </div>

              <div className="webhook-meta">
                <span>
                  Created {new Date(sub.createdAt).toLocaleDateString()}
                </span>
                {sub.lastTriggeredAt && (
                  <span>
                    Last triggered:{" "}
                    {new Date(sub.lastTriggeredAt).toLocaleString()}
                  </span>
                )}
                {sub.lastStatus && (
                  <span className={sub.lastStatus >= 200 && sub.lastStatus < 300 ? "status-ok" : "status-error"}>
                    Last status: {sub.lastStatus}
                  </span>
                )}
                {sub.failureCount > 0 && (
                  <span className="status-error">
                    Failures: {sub.failureCount}
                  </span>
                )}
              </div>

              <div className="webhook-actions">
                <button
                  onClick={() => handleDelete(sub.id)}
                  className="btn btn-danger btn-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .webhooks-page {
          max-width: 900px;
          margin: 0 auto;
        }
        
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }
        
        .page-header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        
        .page-header p {
          color: var(--muted);
          margin: 0.5rem 0 0;
        }
        
        .header-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .webhook-form {
          margin-bottom: 2rem;
        }
        
        .webhook-form h2 {
          margin: 0 0 1.5rem;
          font-size: 1.25rem;
        }
        
        .form-group {
          margin-bottom: 1.25rem;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }
        
        .form-group input[type="text"],
        .form-group input[type="url"],
        .form-group input[type="password"] {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.9rem;
        }
        
        .event-checkboxes {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
        }
        
        .event-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        
        .event-checkbox input {
          width: 18px;
          height: 18px;
        }
        
        .form-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }
        
        .webhook-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        
        .webhook-card {
          padding: 1.25rem;
        }
        
        .webhook-card.inactive {
          opacity: 0.6;
        }
        
        .webhook-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }
        
        .webhook-info h3 {
          margin: 0 0 0.25rem;
          font-size: 1.1rem;
        }
        
        .webhook-url {
          font-size: 0.85rem;
          color: var(--accent);
        }
        
        .toggle {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
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
          border-radius: 24px;
          transition: 0.2s;
        }
        
        .toggle-slider::before {
          content: "";
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: 0.2s;
        }
        
        .toggle input:checked + .toggle-slider {
          background-color: var(--success, #22c55e);
        }
        
        .toggle input:checked + .toggle-slider::before {
          transform: translateX(20px);
        }
        
        .webhook-events {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .event-badge {
          padding: 0.25rem 0.75rem;
          background: var(--accent-light);
          color: var(--accent);
          border-radius: 9999px;
          font-size: 0.8rem;
        }
        
        .webhook-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.8rem;
          color: var(--muted);
          margin-bottom: 1rem;
        }
        
        .status-ok {
          color: var(--success, #22c55e);
        }
        
        .status-error {
          color: var(--error, #ef4444);
        }
        
        .webhook-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--muted);
        }
        
        .btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-weight: 500;
          transition: opacity 0.2s;
        }
        
        .btn:hover {
          opacity: 0.9;
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn-primary {
          background: var(--accent);
          color: white;
        }
        
        .btn-secondary {
          background: var(--border);
          color: var(--text);
        }
        
        .btn-danger {
          background: var(--error, #ef4444);
          color: white;
        }
        
        .btn-sm {
          padding: 0.375rem 0.75rem;
          font-size: 0.85rem;
        }
      `}</style>
    </main>
  );
}