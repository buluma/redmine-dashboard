"use client";

import { useEffect, useState } from "react";
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("converge.nav.collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.body.classList.toggle("nav-collapsed", collapsed);
    try {
      localStorage.setItem("converge.nav.collapsed", collapsed ? "true" : "false");
    } catch {
      // Ignore storage errors; collapse still works for current session.
    }
  }, [collapsed]);

  return (
    <>
      <nav className={`app-nav ${collapsed ? "collapsed" : ""}`} aria-label="Primary navigation">
        <div className="nav-brand">
          <Link href="/" className="brand-link">
            {collapsed ? "C" : "Converge"}
          </Link>
          <button
            type="button"
            className="nav-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-pressed={collapsed}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <div className="nav-links">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href ? "active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      <style>{`
        .nav-toggle {
          position: absolute;
          top: 0.6rem;
          right: 0.5rem;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-1, #fff);
          color: var(--text);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
          cursor: pointer;
          display: grid;
          place-items: center;
          font-size: 1rem;
          line-height: 1;
        }

        .nav-toggle:hover {
          background: var(--surface-2);
        }

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
          transition: width 0.2s;
        }
        
        .app-nav.collapsed {
          width: 60px;
        }

        .nav-brand {
          position: relative;
          padding: 0.5rem 1rem;
          margin-bottom: 1rem;
          min-height: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand-link {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--accent);
          text-decoration: none;
        }

        .app-nav.collapsed .brand-link {
          font-size: 1rem;
        }

        .app-nav.collapsed .nav-brand {
          justify-content: flex-end;
        }

        .app-nav.collapsed .brand-link {
          display: none;
        }

        .app-nav.collapsed .nav-toggle {
          width: 1.5rem;
          height: 1.5rem;
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
        
        .app-nav.collapsed .nav-link {
          justify-content: center;
          padding: 0.625rem 0.5rem;
          min-height: 2.35rem;
          line-height: 1.2;
        }
        
        .nav-link:hover {
          background: var(--surface-3);
        }
        
        .nav-link.active {
          background: var(--accent-light);
          color: var(--accent);
          border-left-color: var(--accent);
        }
        
        .app-nav.collapsed .nav-link.active {
          border-left-color: transparent;
          border-bottom: 2px solid var(--accent);
        }
        
        .nav-icon {
          font-size: 1rem;
          width: 1.5rem;
          text-align: center;
          flex-shrink: 0;
        }
        
        .nav-label {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
        }
        
        .app-nav.collapsed .nav-label {
          display: none;
        }
        
        /* Mobile responsive */
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

          .app-nav.collapsed {
            width: 100%;
          }

          .nav-brand,
          .nav-toggle {
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
            display: block;
            font-size: 0.65rem;
          }
        }
      `}</style>
    </>
  );
}
