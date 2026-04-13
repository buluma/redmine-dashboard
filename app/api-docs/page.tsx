"use client";

import Link from "next/link";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function ApiDocsPage() {
  return (
    <main className="dashboard">
      <header className="card hero">
        <div className="hero-top">
          <div>
            <h1>API Documentation</h1>
            <p className="muted">
              NRCC REST API Reference
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="primary-link">Back to Dashboard</Link>
          </div>
        </div>
      </header>

      <section className="card">
        <SwaggerUI 
          url="/api/openapi"
          options={{
            docExpansion: "list",
            defaultModelsExpandDepth: 0,
            filter: true,
            showExtensions: true,
            showCommonExtensions: true,
          }}
        />
      </section>
    </main>
  );
}
