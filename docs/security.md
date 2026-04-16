# Security

This document outlines the security measures implemented in Converge.

## Authentication

### Session Management

Converge uses **HMAC-signed session tokens** for authentication:

- **Token Format**: `{userId}.{expiration}.{signature}`
- **Signing Algorithm**: HMAC-SHA256 with `SESSION_SECRET` environment variable
- **Cookie Settings**:
  - `httpOnly: true` - prevents JavaScript access
  - `sameSite: "strict"` - CSRF protection
  - `secure: true` - HTTPS only in production
  - `maxAge`: 30 days

```typescript
// src/lib/session.ts
export function createSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  const sig = sign(payload); // HMAC-SHA256
  return `${payload}.${sig}`;
}
```

### CSRF Protection

All mutating API requests (POST, PUT, PATCH, DELETE) require CSRF validation:

- **CSRF Token**: Generated as a random 64-character hex string
- **Cookie**: `rd_csrf` with `httpOnly: true`, `sameSite: "strict"`
- **Validation Methods**:
  1. `X-CSRF-Token` header matching cookie value
  2. Same-origin check via `Origin` or `Referer` header

```typescript
// src/lib/session.ts
export async function validateCsrfToken(): Promise<boolean> {
  const storedToken = cookies().get(CSRF_COOKIE)?.value;
  const requestToken = headers().get("x-csrf-token");
  return requestToken === storedToken;
}
```

### Role-Based Access Control (RBAC)

Users are assigned one of four roles with decreasing permission levels:

| Role | Permissions |
|------|-------------|
| **ADMIN** | Full access: users, audit logs, webhooks, all CRUD |
| **EDITOR** | Most CRUD, can trigger syncs, no user management |
| **USER** | Own data only, view access to issues/notes/time entries |
| **VIEWER** | Read-only access to issues and time entries |

See [rbac.md](rbac.md) for detailed implementation.

## API Security

### Rate Limiting

Rate limiting is implemented to prevent abuse:

- **In-Memory**: For single-instance deployments
- **Database-Backed**: For distributed deployments using `ApiRateLimit` table
- **Per-User Limits**:
  - Manual sync: 3 requests/minute
  - Issue mutations: 20 requests/minute
  - Read requests: 100 requests/minute

```typescript
// src/lib/rate-limit.ts
const limiter = isRateLimited({
  key: `${user.id}:manual-pull`,
  max: 3,
  windowMs: 60_000,
});
```

### Redmine Credentials

API keys are encrypted at rest using AES-256-GCM:

```typescript
// src/lib/crypto.ts
encryptText(plaintext: string, key: string): { encrypted: string, iv: string }
decryptText(encrypted: string, iv: string, key: string): string
```

Credentials are stored in `UserRedmineCredential` table with:
- `apiKeyEncrypted` - AES-256-GCM encrypted
- `apiKeyIv` - Initialization vector
- `isActive` - Can be disabled without deletion

## Security Headers

The application sets the following headers:

- `Strict-Transport-Security` - Enforce HTTPS
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy` - Configured in Next.js

## External API (n8n/Zapier)

The `/api/external/tickets` endpoint requires authentication:

- **Header**: `X-API-Key: {key}`
- **Query**: `?api_key={key}`
- **Keys**: Configured via `EXTERNAL_API_KEYS` environment variable (comma-separated)

## Mobile API

Mobile authentication uses token-based auth:

- Tokens generated and stored in `MobileToken` table
- Token includes device fingerprint and expiration
- Validated via `Authorization: Bearer {token}` header

See [mobile/README.md](mobile/README.md) for details.

## Security Checklist

- [x] Session cookies with httpOnly and SameSite=strict
- [x] CSRF protection on mutating endpoints
- [x] RBAC enforcement on sensitive API routes
- [x] Rate limiting on sync and write operations
- [x] Encrypted storage of API keys
- [x] External API key authentication
- [x] Mobile token-based authentication

## Environment Variables

Key security-related environment variables:

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | HMAC signing key for sessions |
| `APP_ENCRYPTION_KEY` | AES encryption for credentials |
| `EXTERNAL_API_KEYS` | API keys for external integrations |
| `DIRECT_URL` | Database connection (production) |

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:
- Do not open a public GitHub issue
- Contact the maintainer directly