"use client";

import { useState } from "react";

export function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    filesProcessed: number;
    errors: string[];
    guardLimit: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setBusy(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/heimdall/refresh", { method: "POST" });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Unknown error occurred");
        setBusy(false);
        return;
      }

      const totalCreated =
        data.mbuLogs.created + data.serverSideRules.created + data.traces.created;
      const totalSkipped =
        data.mbuLogs.skipped + data.serverSideRules.skipped + data.traces.skipped;

      setResult({
        created: totalCreated,
        skipped: totalSkipped,
        filesProcessed: data.filesProcessed,
        errors: data.errors || [],
        guardLimit: data.guardLimit,
      });
    } catch (err: any) {
      console.error("Refresh failed:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setBusy(false);
    }
  };

  const handlePageReload = () => {
    window.location.reload();
  };

  return (
    <div>
      <button
        onClick={handleRefresh}
        disabled={busy}
        style={{
          padding: "0.45rem 1rem",
          border: "1px solid var(--accent, #e63946)",
          borderRadius: "6px",
          background: busy ? "var(--accent, #e63946)" : "transparent",
          color: busy ? "#fff" : "var(--accent, #e63946)",
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: "0.85rem",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          transition: "all 0.15s ease",
          opacity: busy ? 0.8 : 1,
        }}
      >
        {busy ? "⟳ Fetching & Importing…" : "⟳ Refresh Logs"}
      </button>

      {result && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: result.created > 0 ? "var(--bg-subtle, #f0f9ff)" : "#fef9e7",
            border: `1px solid ${result.created > 0 ? "var(--border, #e0e0e0)" : "#f0d56d"}`,
            borderRadius: "6px",
            fontSize: "0.78rem",
            color: "var(--text, #222)",
            maxWidth: "550px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            {result.created > 0 ? (
              <>
                ✅ Imported <strong>{result.created}</strong> new record{result.created !== 1 ? "s" : ""} ·{" "}
                <strong>{result.skipped}</strong> already existed ·{" "}
                <strong>{result.filesProcessed}</strong> files
                {result.guardLimit && (
                  <span style={{ color: "var(--muted, #888)" }}>
                    {" "}· guard: last {result.guardLimit}/file
                  </span>
                )}
              </>
            ) : result.skipped > 0 ? (
              <>ℹ️ No new records — all {result.skipped} already exist.</>
            ) : (
              <>ℹ️ No log files found. Run the Ansible playbook first.</>
            )}
            {result.errors.length > 0 && (
              <div style={{ marginTop: "0.25rem", color: "#dc3545", fontSize: "0.72rem" }}>
                ⚠️ {result.errors.length} error(s): {result.errors.slice(0, 2).join("; ")}
                {result.errors.length > 2 && " …"}
              </div>
            )}
          </div>
          <button
            onClick={handlePageReload}
            style={{
              padding: "0.3rem 0.6rem",
              borderRadius: "4px",
              border: "1px solid var(--border, #e0e0e0)",
              background: "transparent",
              color: "var(--text, #222)",
              fontSize: "0.72rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ↻ Reload page
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "#fff5f5",
            border: "1px solid #fed7d7",
            borderRadius: "6px",
            fontSize: "0.78rem",
            color: "#dc3545",
            maxWidth: "550px",
          }}
        >
          ❌ {error}
        </div>
      )}
    </div>
  );
}
