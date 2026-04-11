import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
}

const startTime = Date.now();

export async function GET() {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };

  // Quick database check
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    health.status = "degraded";
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}