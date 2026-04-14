/**
 * Role-Based Access Control (RBAC)
 * 
 * Provides permission checking based on user roles.
 * Roles: ADMIN, EDITOR, USER, VIEWER
 */

import { prisma } from "@/src/lib/db";
import { requireCurrentUser } from "@/src/lib/auth";

export type UserRole = "ADMIN" | "EDITOR" | "USER" | "VIEWER";

export type Permission = 
  | "issues:read" | "issues:write" | "issues:delete"
  | "notes:read" | "notes:write" | "notes:delete"
  | "time_entries:read" | "time_entries:write"
  | "sync:trigger" | "sync:view"
  | "users:manage" | "users:view"
  | "audit:view" | "ops:view"
  | "mobile:api"
  | "slack:manage";

// Role to permissions mapping
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "issues:read", "issues:write", "issues:delete",
    "notes:read", "notes:write", "notes:delete",
    "time_entries:read", "time_entries:write",
    "sync:trigger", "sync:view",
    "users:manage", "users:view",
    "audit:view", "ops:view",
    "mobile:api", "slack:manage",
  ],
  EDITOR: [
    "issues:read", "issues:write",
    "notes:read", "notes:write",
    "time_entries:read", "time_entries:write",
    "sync:trigger", "sync:view",
    "users:view",
    "audit:view", "ops:view",
    "mobile:api",
  ],
  USER: [
    "issues:read", "issues:write",
    "notes:read", "notes:write",
    "time_entries:read", "time_entries:write",
    "sync:view",
    "audit:view",
    "mobile:api",
  ],
  VIEWER: [
    "issues:read",
    "notes:read",
    "time_entries:read",
    "sync:view",
  ],
};

/**
 * Get user's role from database
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  return user?.role ?? "USER";
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const role = await getUserRole(userId);
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes(permission);
}

/**
 * Require a specific permission or throw
 */
export async function requirePermission(permission: Permission): Promise<void> {
  const user = await requireCurrentUser();
  const allowed = await hasPermission(user.id, permission);
  if (!allowed) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

/**
 * Require minimum role level
 */
export async function requireRole(minRole: UserRole, ...additionalRoles: UserRole[]): Promise<void> {
  const user = await requireCurrentUser();
  const userRole = await getUserRole(user.id);
  
  const roleHierarchy: UserRole[] = ["VIEWER", "USER", "EDITOR", "ADMIN"];
  const userLevel = roleHierarchy.indexOf(userRole);
  const requiredLevel = roleHierarchy.indexOf(minRole);
  
  // Check if user has any of the allowed roles
  const allowedRoles = [minRole, ...additionalRoles];
  if (!allowedRoles.includes(userRole)) {
    throw new Error(`Role requirement not met: ${minRole} required, ${userRole} found`);
  }
}

/**
 * Check if user can access a specific entity (ownership check)
 * - Admins can access everything
 * - Editors can access all issues but only their own notes
 * - Users can only access their own data
 */
export async function canAccessEntity(
  userId: string,
  entityType: "Issue" | "InternalNote" | "TimeEntry" | "SyncJob",
  entityOwnerId?: string | null
): Promise<boolean> {
  const role = await getUserRole(userId);
  
  // Admins can access everything
  if (role === "ADMIN") return true;
  
  // Editors can access all issues, but only their own notes/entries
  if (role === "EDITOR") {
    if (entityType === "Issue") return true;
    return entityOwnerId === userId;
  }
  
  // Users and Viewers can only access their own data
  return entityOwnerId === userId;
}

/**
 * Middleware helper: Check permission and return error response if not allowed
 */
export async function checkPermissionOrThrow(permission: Permission): Promise<boolean> {
  const user = await requireCurrentUser();
  const allowed = await hasPermission(user.id, permission);
  if (!allowed) {
    throw new Error(`Forbidden: ${permission} required`);
  }
  return true;
}

/**
 * Get all permissions for a user (for UI display)
 */
export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const role = await getUserRole(userId);
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    ADMIN: "Administrator",
    EDITOR: "Editor",
    USER: "User",
    VIEWER: "Viewer",
  };
  return names[role] ?? role;
}

/**
 * Check if feature is available based on role
 */
export async function isFeatureEnabled(userId: string, feature: string): Promise<boolean> {
  const role = await getUserRole(userId);
  
  // Feature to permission mapping
  const featurePermissions: Record<string, Permission[]> = {
    "ai-summarize": ["issues:read"],
    "ai-chat": ["issues:read"],
    "slack-integration": ["issues:read", "slack:manage"],
    "mobile-api": ["mobile:api"],
    "internal-notes": ["notes:read"],
    "time-tracking": ["time_entries:read"],
    "github-links": ["issues:write"],
    "bulk-actions": ["issues:write"],
    "audit-logs": ["audit:view"],
    "ops-console": ["ops:view"],
  };
  
  const required = featurePermissions[feature] ?? [];
  if (required.length === 0) return true;
  
  return required.some(p => hasPermission(userId, p));
}