"use client";

import { useI18n } from "@/src/components/I18nProvider";

import { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

// Suppress React 19 deprecation warnings from swagger-ui-react
const suppressWarnings = () => {
  if (typeof window !== "undefined") {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (
        typeof message === "string" &&
        (message.includes("UNSAFE_componentWillReceiveProps") ||
          message.includes("ParameterRow") ||
          message.includes("Select"))
      ) {
        return;
      }
      originalError(...args);
    };
  }
};

export default function ApiDocsPage() {
  const { t } = useI18n();

  useEffect(() => {
    suppressWarnings();
  }, []);

  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <p className="kicker">{t("apiDocs.kicker")}</p>
            <h1>{t("apiDocs.title")}</h1>
            <p className="muted">{t("apiDocs.description")}</p>
          </div>
          <div className="hero-actions"></div>
        </div>
      </header>

      <section className="card">
        <SwaggerUI
          url="/api/openapi"
          docExpansion="list"
          defaultModelsExpandDepth={0}
          filter
          showExtensions
          showCommonExtensions
        />
      </section>
    </main>
  );
}
