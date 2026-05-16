import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Sora, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "./styles/components.css";
import "./styles/dashboard-detail.css";
import "./styles/reports-ai.css";
import "./styles/issue-ui.css";
import "./styles/theme-dark.css";
import { ErrorLoggerProvider } from "@/src/components/ErrorLoggerProvider";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { SyncQueueInitializer } from "@/src/components/SyncQueueInitializer";
import { ServiceWorkerRegistrar } from "@/src/components/ServiceWorkerRegistrar";
import { AppNav } from "@/src/components/AppNav";
import { NotificationsPanel } from "@/src/components/NotificationsPanel";
import { ToastProvider } from "@/src/components/ToastProvider";
import { I18nProvider, useI18n } from "@/src/components/I18nProvider";
import { ThemeProvider } from "@/src/components/ThemeProvider";
import { LocaleIndicator } from "@/src/components/LocaleIndicator";
import React, { useContext } from 'react';
import { LocaleSwitcherTest } from '@/src/components/LocaleSwitcherTest';
import { getSessionUserId } from "@/src/lib/session";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Converge",
  description: "Unified operations dashboard: Redmine issues, Slack messages, AI insights, and more.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Converge",
  },
  icons: {
    icon: "/icons/icon-512x512.png",
    apple: "/icons/icon-512x512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#006d77",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getSessionUserId();
  const isAuthenticated = !!userId;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint — prevents flash of wrong theme */}
        <Script
          src="/scripts/theme-init.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${sora.variable} ${mono.variable} ${display.variable}`}>
        <ErrorLoggerProvider>
          <ThemeProvider>
          <ToastProvider>
            <I18nProvider>
              <LocaleIndicator />
              <OfflineBanner />
              <SyncQueueInitializer />
              <ServiceWorkerRegistrar />
              {isAuthenticated && <AppNav />}
              {isAuthenticated && (
                <div className="global-notif-shell">
                  <NotificationsPanel />
                </div>
              )}
              <div className={isAuthenticated ? "main-content" : "main-content main-content--full"}>
                {children}
              </div>
            </I18nProvider>
          </ToastProvider>
          </ThemeProvider>
        </ErrorLoggerProvider>
        <style>{`
          body {
            --sidebar-width: 200px;
          }

          body.nav-collapsed {
            --sidebar-width: 60px;
          }

          .main-content {
            margin-left: var(--sidebar-width);
            min-height: 100vh;
            transition: margin-left 0.2s;
            min-width: 0;
            overflow-x: hidden;
          }

          .main-content--full {
            margin-left: 0;
          }

          .global-notif-shell {
            position: fixed;
            top: 0.75rem;
            right: 1rem;
            z-index: 200;
          }

          @media (max-width: 768px) {
            .global-notif-shell {
              top: 0.5rem;
              right: 0.5rem;
            }
          }

          @media (max-width: 768px) {
            body,
            body.nav-collapsed {
              --sidebar-width: 0px;
            }

            .main-content {
              margin-left: 0;
              margin-bottom: 60px;
            }
          }
        `}</style>
      </body>
    </html>
  );
}
