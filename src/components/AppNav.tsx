"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useI18n } from "./I18nProvider";

type NavItem = { href: string; labelKey: string; icon: string; group?: string; mobilePrimary?: boolean };

const navItems: NavItem[] = [
  { href: "/", labelKey: "nav.dashboard", icon: "🏠", mobilePrimary: true },
  { href: "/personal-tickets", labelKey: "nav.personalTickets", icon: "📝", group: "Personal", mobilePrimary: true },
  { href: "/ai-summaries", labelKey: "nav.aiSummaries", icon: "🤖", group: "Personal" },
  { href: "/chat", labelKey: "nav.chat", icon: "💬", group: "Personal" },
  { href: "/heimdall", labelKey: "nav.heimdall", icon: "🔍", group: "Team Ops", mobilePrimary: true },
  { href: "/slack", labelKey: "nav.slack", icon: "💬", group: "Team Ops" },
  { href: "/wakatime", labelKey: "nav.wakatime", icon: "⏱️", group: "Team Ops" },
  { href: "/correlation", labelKey: "nav.correlation", icon: "⚡", group: "Team Ops" },
  { href: "/reports", labelKey: "nav.reports", icon: "📊", group: "Reporting", mobilePrimary: true },
  { href: "/webhooks", labelKey: "nav.webhooks", icon: "🔗", group: "Integrations" },
  { href: "/api-docs", labelKey: "nav.apiDocs", icon: "📚", group: "Integrations" },
  { href: "/ops", labelKey: "nav.ops", icon: "⚙️", group: "System" },
];

export function AppNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const { t } = useI18n();

  // Load collapsed state from localStorage after mount
  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem("converge.nav.collapsed") === "true") {
        setCollapsed(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("nav-collapsed", collapsed);
    try {
      localStorage.setItem("converge.nav.collapsed", collapsed ? "true" : "false");
    } catch {
      // Ignore storage errors; collapse still works for current session.
    }
  }, [collapsed]);

  // Group nav items
  const groupedItems = navItems.reduce((acc, item) => {
    const group = item.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, typeof navItems>);

  const groupLabelKeys: Record<string, string> = {
    "Personal": "nav.groups.personal",
    "Team Ops": "nav.groups.teamOps",
    "Reporting": "nav.groups.reporting",
    "Integrations": "nav.groups.integrations",
    "System": "nav.groups.system",
    "Other": "nav.groups.other"
  };

  return (
    <>
      <nav className={`app-nav ${mounted && collapsed ? "collapsed" : ""}`} aria-label="Primary navigation">
        <div className="nav-brand">
          <Link href="/" className="brand-link">
            {mounted && collapsed ? "C" : mounted ? "Converge" : "Converge"}
          </Link>
          <button
            type="button"
            className="nav-toggle"
            onClick={() => setCollapsed((prev) => !prev)}
            title={mounted && collapsed ? t("nav.tooltips.expand") : t("nav.tooltips.collapse")}
            aria-label={mounted && collapsed ? t("nav.tooltips.expand") : t("nav.tooltips.collapse")}
            aria-pressed={mounted ? collapsed : false}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <div className="nav-links">
          {Object.entries(groupedItems).map(([group, items]) => (
            <div key={group} className="nav-group">
              {mounted && !collapsed && <div className="nav-group-label">{t(groupLabelKeys[group] || "nav.groups.other")}</div>}
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${pathname === item.href ? "active" : ""} ${item.mobilePrimary ? "nav-link-mobile-primary" : "nav-link-mobile-secondary"}`}
                  title={mounted && collapsed ? t(item.labelKey) : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  {(mounted && !collapsed) && <span className="nav-label">{t(item.labelKey)}</span>}
                </Link>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="nav-link nav-mobile-more"
            onClick={() => setMobileMoreOpen(true)}
            aria-label={t("nav.tooltips.more", "More")}
            aria-expanded={mobileMoreOpen}
          >
            <span className="nav-icon" aria-hidden="true">⋯</span>
            <span className="nav-label">{t("nav.tooltips.more", "More")}</span>
          </button>
        </div>
        <div className="nav-footer">
          <ThemeToggle collapsed={mounted && collapsed} />
          <LanguageSwitcher />
        </div>
      </nav>

      {mobileMoreOpen && (
        <div className="nav-mobile-sheet-backdrop" onClick={() => setMobileMoreOpen(false)}>
          <div
            className="nav-mobile-sheet"
            role="dialog"
            aria-label={t("nav.tooltips.more", "More")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nav-mobile-sheet-head">
              <strong>{t("nav.tooltips.more", "More")}</strong>
              <button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="nav-mobile-sheet-list">
              {navItems.filter((item) => !item.mobilePrimary).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${pathname === item.href ? "active" : ""}`}
                  onClick={() => setMobileMoreOpen(false)}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{t(item.labelKey)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

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
        
        .nav-group {
          margin-bottom: 0.5rem;
        }
        
        .nav-group-label {
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-soft);
          padding: 0.75rem 1rem 0.375rem;
          margin-top: 0.5rem;
        }
        
        .nav-group:first-child .nav-group-label {
          margin-top: 0;
        }
        
        .nav-footer {
          margin-top: auto;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
        }
        
        .app-nav.collapsed .nav-footer {
          display: none;
        }
        
        .app-nav.collapsed .nav-group-label {
          display: none;
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

          .nav-group-label { display: none; }
          .nav-group { display: contents; }

          .nav-link-mobile-secondary { display: none; }
          .nav-mobile-more {
            display: flex;
            background: transparent;
            color: var(--text);
            cursor: pointer;
          }
        }

        @media (min-width: 769px) {
          .nav-mobile-more { display: none; }
        }

        .nav-mobile-sheet-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          z-index: 1000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .nav-mobile-sheet {
          width: 100%;
          max-width: 560px;
          background: var(--surface-1, #fff);
          color: var(--text);
          border-top-left-radius: 12px;
          border-top-right-radius: 12px;
          padding: 0.75rem 1rem 1.25rem;
          box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.15);
          max-height: 75vh;
          overflow-y: auto;
          animation: nav-sheet-up 180ms ease-out;
        }

        @keyframes nav-sheet-up {
          from { transform: translateY(12%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nav-mobile-sheet { animation: none; }
        }

        .nav-mobile-sheet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border, var(--line));
          margin-bottom: 0.5rem;
        }

        .nav-mobile-sheet-head button {
          border: 0;
          background: transparent;
          font-size: 1.1rem;
          cursor: pointer;
          color: var(--text);
        }

        .nav-mobile-sheet-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.25rem 0.5rem;
        }

        .nav-mobile-sheet-list .nav-link {
          flex-direction: row;
          gap: 0.5rem;
          padding: 0.6rem 0.75rem;
          border-bottom: 0;
          font-size: 0.85rem;
        }
      `}</style>
    </>
  );
}
