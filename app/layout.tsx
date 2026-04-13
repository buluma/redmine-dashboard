import type { Metadata } from "next";
import { Sora, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ErrorLoggerProvider } from "@/src/components/ErrorLoggerProvider";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${mono.variable} ${display.variable}`}>
        <ErrorLoggerProvider>
          {children}
        </ErrorLoggerProvider>
      </body>
    </html>
  );
}
