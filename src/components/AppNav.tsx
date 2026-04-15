"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/heimdall", label: "Heimdall", icon: "🔍" },
  { href: "/issues", label: "Issues", icon: "🎫" },
  { href: "/personal-tickets", label: "Personal", icon: "📝" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/ai-summaries", label: "AI", icon: "🤖" },
  { href: "/ops", label: "Ops", icon: "⚙️" },
  { href: "/slack", label: "Slack", icon: "💬" },
  { href: "/wakatime", label: "WakaTime", icon: "⏱️" },
  { href: "/webhooks", label: "Webhooks", icon: "🔗" },
  { href: "/api-docs", label: "API", icon: "📚" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav">
      <div className="nav-brand">
        <Link href="/" className="brand-link">Converge</Link>
      </div>
      <div className="nav-links">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? "active" : ""}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </div>
      <style>{`
        .app-nav {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 200px;
          background: var(--surface-2);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 1rem 0;
          overflow-y: auto;
          z-index: 100;
        }
        
        .nav-brand {
          padding: 0.5rem 1rem;
          margin-bottom: 1rem;
        }
        
        .brand-link {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--accent);
          text-decoration: none;
        }
        
        .nav-links {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 1rem;
          color: var(--text);
          text-decoration: none;
          font-size: 0.9rem;
          transition: background 0.15s, color 0.15s;
          border-left: 3px solid transparent;
        }
        
        .nav-link:hover {
          background: var(--surface-3);
        }
        
        .nav-link.active {
          background: var(--accent-light);
          color: var(--accent);
          border-left-color: var(--accent);
        }
        
        .nav-icon {
          font-size: 1rem;
          width: 1.5rem;
          text-align: center;
        }
        
        .nav-label {
          font-weight: 500;
        }
        
        /* Collapsed mobile view */
        @media (max-width: 768px) {
          .app-nav {
            position: fixed;
            left: 0;
            right: 0;
            top: auto;
            bottom: 0;
            width: 100%;
            height: auto;
            flex-direction: row;
            padding: 0.5rem;
            border-right: none;
            border-top: 1px solid var(--border);
          }
          
          .nav-brand {
            display: none;
          }
          
          .nav-links {
            flex-direction: row;
            justify-content: space-around;
            width: 100%;
          }
          
          .nav-link {
            flex-direction: column;
            gap: 0.25rem;
            padding: 0.5rem;
            font-size: 0.7rem;
            border-left: none;
            border-bottom: 2px solid transparent;
          }
          
          .nav-link.active {
            border-bottom-color: var(--accent);
            background: transparent;
          }
          
          .nav-label {
            font-size: 0.65rem;
          }
        }
      `}</style>
    </nav>
  );
}