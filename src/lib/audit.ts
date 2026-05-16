/**
 * Audit Logging Service
 * 
 * Tracks all mutations for compliance and security auditing.
 * Every CREATE, UPDATE, DELETE operation should be logged here.
 */

import { prisma } from "@/src/lib/db";
import { trackFailure } from "@/src/lib/telemetry";

export type AuditAction = "CREATE" | "READ" | "UPDATE" | "DELETE";

export interface AuditLogEntry {
  userId?: string | null;
  userEmail?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditContext {
  userId?: string | null;
  userEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const MAX_CHANGES_SIZE = 10000; // Prevent storing huge change objects

function truncateChanges(changes: Record<string, { old: unknown; new: unknown }>): Record<string, { old: unknown; new: unknown }> {
  const serialized = JSON.stringify(changes);
  if (serialized.length > MAX_CHANGES_SIZE) {
    return {
      _truncated: { old: true, new: true },
      _originalSize: { old: serialized.length, new: MAX_CHANGES_SIZE },
    };
  }
  return changes;
}

function extractChanges<T extends Record<string, unknown>>(before: T | null, after: T): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  
  const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  
  for (const key of allKeys) {
    const oldVal = before?.[key];
    const newVal = after[key];
    
    // Skip internal fields
    if (key === "id" || key === "createdAt" || key === "updatedAt" || key === "userId") {
      continue;
    }
    
    // Compare values
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    
    if (oldStr !== newStr) {
      changes[key] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }
  
  return changes;
}

export class AuditService {
  private context: AuditContext;

  constructor(context: AuditContext = {}) {
    this.context = context;
  }

  setContext(context: Partial<AuditContext>) {
    this.context = { ...this.context, ...context };
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const fullEntry: AuditLogEntry = {
        ...entry,
        userId: entry.userId ?? this.context.userId,
        userEmail: entry.userEmail ?? this.context.userEmail,
        ipAddress: entry.ipAddress ?? this.context.ipAddress,
        userAgent: entry.userAgent ?? this.context.userAgent,
        changes: entry.changes ? truncateChanges(entry.changes) : null,
      };

      await prisma.auditLog.create({
        data: {
          userId: fullEntry.userId ?? undefined,
          userEmail: fullEntry.userEmail ?? undefined,
          action: fullEntry.action,
          entityType: fullEntry.entityType,
          entityId: fullEntry.entityId ?? undefined,
          changes: fullEntry.changes as object ?? undefined,
          ipAddress: fullEntry.ipAddress ?? undefined,
          userAgent: fullEntry.userAgent ?? undefined,
          metadata: fullEntry.metadata as object ?? undefined,
        },
      });
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      trackFailure({ event: "audit.log.failed", error, metricName: "audit_log_failed" });
    }
  }

  async logCreate<T extends Record<string, unknown>>(
    entityType: string,
    entity: T,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Extract non-internal fields for the "changes" record
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (key !== "id" && key !== "createdAt" && key !== "updatedAt" && key !== "userId") {
        changes[key] = { old: null, new: value };
      }
    }

    await this.log({
      action: "CREATE",
      entityType,
      entityId: String(entity.id ?? entity.id),
      changes: changes as Record<string, { old: unknown; new: unknown }>,
      metadata: metadata as Record<string, unknown> | null,
    });
  }

  async logUpdate<T extends Record<string, unknown>>(
    entityType: string,
    entityId: string,
    before: T | null,
    after: T,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const changes = extractChanges(before, after);
    
    // Only log if there are actual changes
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.log({
      action: "UPDATE",
      entityType,
      entityId,
      changes: changes as Record<string, { old: unknown; new: unknown }>,
      metadata: metadata as Record<string, unknown> | null,
    });
  }

  async logDelete(
    entityType: string,
    entityId: string,
    deletedData?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    
    if (deletedData) {
      for (const [key, value] of Object.entries(deletedData)) {
        if (key !== "id" && key !== "createdAt" && key !== "updatedAt" && key !== "userId") {
          changes[key] = { old: value, new: null };
        }
      }
    }

    await this.log({
      action: "DELETE",
      entityType,
      entityId,
      changes: Object.keys(changes).length > 0 ? changes as Record<string, { old: unknown; new: unknown }> : undefined,
      metadata: metadata as Record<string, unknown> | null,
    });
  }
}

// Singleton instance
let auditService: AuditService | null = null;

export function getAuditService(context?: AuditContext): AuditService {
  if (!auditService) {
    auditService = new AuditService(context);
  } else if (context) {
    auditService.setContext(context);
  }
  return auditService;
}

// Helper to extract client IP from request headers
export function extractClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? null;
}

// Helper to extract user agent
export function extractUserAgent(request: Request): string | null {
  return request.headers.get("user-agent") ?? null;
}
