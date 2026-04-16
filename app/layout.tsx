import type { Metadata, Viewport } from "next";
import { Sora, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ErrorLoggerProvider } from "@/src/components/ErrorLoggerProvider";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { SyncQueueInitializer } from "@/src/components/SyncQueueInitializer";
import { ServiceWorkerRegistrar } from "@/src/components/ServiceWorkerRegistrar";
import { AppNav } from "@/src/components/AppNav";
import { ToastProvider } from "@/src/components/ToastProvider";
import { I18nProvider } from "@/src/components/I18nProvider";
import { LocaleIndicator } from "@/src/components/LocaleIndicator";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${mono.variable} ${display.variable}`}>
        <ErrorLoggerProvider>
          <ToastProvider>
            <I18nProvider>
              <LocaleIndicator />
              <OfflineBanner />
              <SyncQueueInitializer />
              <ServiceWorkerRegistrar />
              <AppNav />
              <div className="main-content">
                {children}
              </div>
            </I18nProvider>
          </ToastProvider>
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
            padding-top: 1rem;
            min-height: 100vh;
            transition: margin-left 0.2s;
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
