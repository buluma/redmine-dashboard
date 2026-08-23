"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BootstrapState = {
  configured: boolean;
  canBootstrap: boolean;
};

export default function LoginPage() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/redmine/bootstrap")
      .then((r) => r.json())
      .then(setBootstrap)
      .catch(() => setBootstrap({ configured: false, canBootstrap: false }));
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/redmine/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleBootstrap() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/redmine/bootstrap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bootstrap failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bootstrap failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">⬡</span>
          <h1 className="login-title">Converge</h1>
          <p className="login-subtitle">Connect your Redmine account to continue</p>
        </div>

        {bootstrap?.canBootstrap && (
          <div className="login-bootstrap">
            <p className="login-bootstrap-hint">
              Environment credentials detected. You can connect automatically.
            </p>
            <button
              type="button"
              className="login-btn login-btn-secondary"
              onClick={handleBootstrap}
              disabled={loading}
            >
              {loading ? "Connecting…" : "Connect with environment credentials"}
            </button>
            <div className="login-divider"><span>or connect manually</span></div>
          </div>
        )}

        <form onSubmit={handleConnect} className="login-form">
          <div className="login-field">
            <label htmlFor="baseUrl">Redmine URL</label>
            <input
              id="baseUrl"
              type="url"
              placeholder="https://redmine.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
              autoFocus={!bootstrap?.canBootstrap}
              disabled={loading}
            />
          </div>
          <div className="login-field">
            <label htmlFor="apiKey">API Key</label>
            <input
              id="apiKey"
              type="password"
              placeholder="Your Redmine API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              minLength={8}
              disabled={loading}
            />
            <p className="login-field-hint">
              Find your API key in Redmine → My account → API access key
            </p>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn login-btn-primary" disabled={loading}>
            {loading ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background:
            radial-gradient(circle at 8% 12%, #f3d6b7 0%, transparent 22%),
            radial-gradient(circle at 85% 10%, #d6e6e8 0%, transparent 30%),
            radial-gradient(circle at 76% 88%, #f1e7d3 0%, transparent 25%),
            var(--bg);
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 2.5rem 2rem;
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .login-brand {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
        }

        .login-logo {
          font-size: 2.5rem;
          line-height: 1;
          color: var(--accent);
        }

        .login-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--ink);
          margin: 0;
          font-family: var(--font-display), sans-serif;
        }

        .login-subtitle {
          font-size: 0.875rem;
          color: var(--ink-soft);
          margin: 0;
        }

        .login-bootstrap {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .login-bootstrap-hint {
          font-size: 0.82rem;
          color: var(--ink-soft);
          margin: 0;
          text-align: center;
        }

        .login-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--ink-soft);
          font-size: 0.78rem;
        }

        .login-divider::before,
        .login-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--line);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .login-field label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--ink);
        }

        .login-field input {
          padding: 0.65rem 0.85rem;
          border: 1px solid var(--line);
          border-radius: 10px;
          font-size: 0.9rem;
          background: var(--bg-soft);
          color: var(--ink);
          transition: border-color 0.15s, box-shadow 0.15s;
          width: 100%;
          box-sizing: border-box;
        }

        .login-field input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .login-field input:disabled {
          opacity: 0.6;
        }

        .login-field-hint {
          font-size: 0.75rem;
          color: var(--ink-soft);
          margin: 0;
        }

        .login-error {
          font-size: 0.82rem;
          color: var(--danger);
          background: var(--danger-soft);
          border: 1px solid var(--danger);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          margin: 0;
        }

        .login-btn {
          padding: 0.7rem 1rem;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: background 0.15s, opacity 0.15s;
          width: 100%;
        }

        .login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-btn-primary {
          background: var(--accent);
          color: #fff;
        }

        .login-btn-primary:hover:not(:disabled) {
          background: var(--accent-strong);
        }

        .login-btn-secondary {
          background: var(--accent-soft);
          color: var(--accent-strong);
          border: 1px solid var(--accent);
        }

        .login-btn-secondary:hover:not(:disabled) {
          background: var(--accent);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
