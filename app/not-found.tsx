import Link from "next/link";

export default function NotFound() {
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
          <Link href="/" className="not-found-btn not-found-btn-primary">
            ← Back to Dashboard
          </Link>
          <Link href="/ops" className="not-found-btn not-found-btn-secondary">
            Sync Operations
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
