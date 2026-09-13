import type { UserRole } from '@/src/lib/rbac';

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

/** Whether a tool mutates state and therefore requires user confirmation. */
const mutatingTools = new Set([
  'update_status',
  'log_time',
  'add_comment',
  'close_issue',
  'update_issue',
]);

/**
 * Minimum role required to invoke each tool. Tools not listed default to
 * VIEWER (read-only). Hierarchy: VIEWER < USER < EDITOR < ADMIN.
 *
 * Mutating tools start at USER because every employee with a Converge
 * account is at least a USER; EDITOR is reserved for tools that affect
 * issue lifecycle (close/update fields).
 */
const TOOL_ROLE_REQUIREMENTS: Record<string, UserRole> = {
  // Read-only — VIEWER is the floor.
  get_issue: 'VIEWER',
  search_issues: 'VIEWER',
  list_statuses: 'VIEWER',
  list_activities: 'VIEWER',
  get_time_summary: 'VIEWER',
  // Routine mutations any user can perform.
  log_time: 'USER',
  add_comment: 'USER',
  update_status: 'USER',
  // Lifecycle-level changes.
  close_issue: 'EDITOR',
  update_issue: 'EDITOR',
};

const ROLE_HIERARCHY: UserRole[] = ['VIEWER', 'USER', 'EDITOR', 'ADMIN'];

/**
 * Returns true when the given tool name requires explicit user confirmation
 * before execution.
 * @param {string} name - Tool function name.
 * @returns {boolean}
 */
export function requiresConfirmation(name: string): boolean {
  return mutatingTools.has(name);
}

/**
 * Minimum role required to invoke a tool. Unknown tools default to ADMIN
 * (fail closed) so a future tool added without a role entry cannot be
 * called by lower-privileged users.
 */
export function getRequiredRole(name: string): UserRole {
  return TOOL_ROLE_REQUIREMENTS[name] ?? 'ADMIN';
}

export function roleAtLeast(actual: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(actual) >= ROLE_HIERARCHY.indexOf(required);
}
