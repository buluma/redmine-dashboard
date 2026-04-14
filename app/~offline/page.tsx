"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function OfflinePage() {
  const [online, setOnline] = useState(false);

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
          <h1>📡 Connection Restored</h1>
          <p className="muted">You're back online. Redirecting...</p>
          <Link href="/" className="primary-link">Go to Dashboard</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <section className="card" style={{ textAlign: "center", padding: "3rem" }}>
        <h1>📡 You're Offline</h1>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Showing cached data. Some features may be limited.
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <Link href="/" className="primary-link">Back to Dashboard</Link>
        </div>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          Tip: Visit issues while online to cache them for offline viewing.
        </p>
      </section>
    </main>
  );
}
