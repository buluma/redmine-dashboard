import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

// Simple in-memory metrics store (could be moved to Redis)
const metrics = {
  requests: 0,
  errors: 0,
  lastError: null as string | null,
  uptime: Date.now(),
  endpoints: new Map<string, number>(),
};

export async function GET() {
  // Get database stats
  let dbStats = { users: 0, issues: 0, attachments: 0 };
  try {
    const [users, issues, attachments] = await Promise.all([
      prisma.user.count(),
      prisma.issue.count(),
      prisma.issueAttachment.count(),
    ]);
    dbStats = { users, issues, attachments };
  } catch {
    // Ignore db errors for metrics
  }

  const response = {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - metrics.uptime) / 1000),
    requests: metrics.requests,
    errors: metrics.errors,
    errorRate: metrics.requests > 0 ? (metrics.errors / metrics.requests * 100).toFixed(2) + "%" : "0%",
    lastError: metrics.lastError,
    database: dbStats,
    endpoints: Object.fromEntries(metrics.endpoints),
  };

  return NextResponse.json(response);
}

// Function to record metrics (can be called from routes)
export function recordRequest(endpoint: string, error = false) {
  metrics.requests++;
  if (error) {
    metrics.errors++;
    metrics.lastError = `${endpoint} at ${new Date().toISOString()}`;
  }
  const count = metrics.endpoints.get(endpoint) ?? 0;
  metrics.endpoints.set(endpoint, count + 1);
}