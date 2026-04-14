# RBAC — Role-Based Access Control

Converge enforces access control through four roles with progressively restricted permissions.

## Roles

| Role | Dashboard | Ops Page | User Management | Audit Logs | Role Changes |
|------|-----------|----------|-----------------|------------|--------------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Editor** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **User** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Viewer** | ✅ (read-only) | ❌ | ❌ | ❌ | ❌ |

## Implementation

Role checking is handled by `src/lib/rbac.ts`:

```typescript
// Require a minimum role or throw 403
await requireRole(request, "editor");

// Check if user has a specific role
const isEditor = await hasRole(userId, "editor");

// Get role display name for UI
const displayName = getRoleDisplayName("admin"); // "Administrator"
```

Roles are stored on the `User` model:

```prisma
model User {
  role String @default("user") // "admin" | "editor" | "user" | "viewer"
  // ...
}
```

## Management

- Role assignment is available at `/ops/users` (Admin only)
- New users default to `user` role on first login
- Role changes are logged to the audit log

## Gated Routes

The following API routes enforce role checks:

| Route | Minimum Role |
|-------|-------------|
| `GET /api/ops/*` | editor |
| `GET /api/admin/users` | admin |
| `POST /api/admin/users/[id]/role` | admin |
| `GET /api/internal/notes` | editor |
| `POST /api/internal/notes` | editor |

## Adding a New Role

1. Add the role string to `ROLES` array in `src/lib/rbac.ts`
2. Define its permission level in the `ROLE_LEVEL` map (higher = more access)
3. Add permission checks to relevant API routes
4. Update the UI role selector at `/ops/users`
