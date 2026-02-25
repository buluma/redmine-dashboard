import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ensurePollerStarted } from "@/src/lib/poller";

const sora = Sora({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Redmine Assigned Issues Dashboard",
  description: "Dashboard for assigned Redmine issues with status, comments, timelog, and sync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensurePollerStarted();

  return (
    <html lang="en">
      <body className={`${sora.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
