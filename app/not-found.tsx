"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <main className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-illustration">
          <div className="not-found-icon">🔍</div>
          <div className="not-found-code">404</div>
        </div>
        <h1>Page Not Found</h1>
        <p className="not-found-description">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="not-found-actions">
          <button type="button" className="not-found-btn not-found-btn-secondary" onClick={() => router.back()}>
            ← Go Back
          </button>
          <Link href="/" className="not-found-btn not-found-btn-primary">
            Back to Dashboard
          </Link>
        </div>
        <div className="not-found-help">
          <p>
            <strong>Need help?</strong> Try these:
          </p>
          <ul>
            <li>Search for your issue on the <Link href="/">dashboard</Link></li>
            <li>Check the <Link href="/reports">reports page</Link> for filtered views</li>
            <li>Run a <Link href="/ops">manual sync</Link> if data seems stale</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
