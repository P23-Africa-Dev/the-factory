# Role-Aware Authentication System - API Documentation

## System Overview

The authentication system uses one Sanctum-based token infrastructure with two role-based entry points:

- Shared management endpoint: `/api/v1/auth/login`
  - Owner
  - Admin
  - Supervisor
- Agent endpoint: `/api/v1/agent/login`
  - Agent users only

Dashboard contract:

1. Management users receive `dashboard_path=/dashboard`.
2. Agents receive `dashboard_path=/agent/dashboard`.

Backward compatibility:

- `/api/v1/internal/login` remains available as a deprecated alias for agents only.

## Authentication Roles

### Shared Management Auth Endpoint (`POST /api/v1/auth/login`)

Allowed users:

1. Self-serve admin users (`internal_role = null`, onboarding complete, active company membership with role `owner|admin`)
2. Enterprise admin users (`internal_role = null`, enterprise onboarding complete, active company membership with role `owner|admin`)
3. Supervisors (`internal_role = supervisor`, `onboarding_status = active`, active company membership with role `owner|admin|supervisor`)

### Agent Endpoint (`POST /api/v1/agent/login`)

Allowed users:

1. Agents only (`internal_role = agent`, `onboarding_status = active`, active company membership with role `agent`)

## Endpoints

1. `POST /api/v1/auth/login`
2. `POST /api/v1/auth/logout` (authenticated, revokes current token)
3. `POST /api/v1/agent/login`
4. `POST /api/v1/internal/login` (deprecated alias for agents only)
5. `GET /api/v1/user/me` (authenticated profile including active company context)
6. `GET|POST|PATCH /api/v1/admin/*` (management scope only)
7. `GET|POST|PATCH /api/v1/agent/*` (agent scope only)

Canonical protected namespaces:

1. Management: `/api/v1/admin/tasks`, `/api/v1/admin/projects`, `/api/v1/admin/payroll`, `/api/v1/admin/internal-users`
2. Agent: `/api/v1/agent/tasks`, `/api/v1/agent/tasks/self`, `/api/v1/agent/tasks/{task}/status`, `/api/v1/agent/tasks/{task}/proofs`

## Request Structure

Shared auth login request:

```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

Agent login request:

```json
{
  "email": "agent@example.com",
  "password": "securepassword123"
}
```

Headers:

- `Content-Type: application/json`
- `Accept: application/json`

## Response Structure

### Authenticated user profile (`GET /api/v1/user/me`)

```json
{
  "success": true,
  "message": "User profile fetched successfully.",
  "data": {
    "id": 397,
    "name": "Muyiwa Moses",
    "email": "muyi@yopmail.com",
    "avatar": null,
    "email_verified": true,
    "onboarding_completed": true,
    "onboarding_completed_at": "2026-04-18T16:29:36+00:00",
    "enterprise_onboarding_completed": false,
    "enterprise_onboarding_completed_at": null,
    "user_type": "self-serve",
    "active_company": {
      "id": 322,
      "company_id": "FAC-GZZLGAUP",
      "name": "Acme Manufacturing",
      "status": "active",
      "role": "owner"
    },
    "created_at": "2026-04-18T16:14:51+00:00"
  },
  "errors": null
}
```

Onboarding completion semantics:

1. `onboarding_completed` is a normalized boolean for dashboard gating.
2. `onboarding_completed=true` when any of these is complete:

- Self-serve onboarding (`onboarding_completed_at` set)
- Enterprise onboarding (`enterprise_onboarding_completed_at` set)
- Internal onboarding (`internal_onboarding_completed_at` set)

3. `user_type` identifies which onboarding path completed first (`self-serve|enterprise|internal`).
4. Frontend should gate dashboard access using token validity + `/api/v1/user/me` success, not redirection alone.

Company context rules:

1. Company-scoped APIs use active membership in `company_users`.
2. If request sends `company_id`, user must belong to that exact active company.
3. If request omits `company_id`, backend resolves latest active membership automatically.
4. Frontend should use `data.active_company.id` from `/api/v1/user/me` when explicitly sending `company_id`.

### Shared auth success (200)

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "dashboard_path": "/dashboard",
    "user_type": "self-serve|enterprise|supervisor",
    "access_role": "admin|supervisor",
    "internal_role": "supervisor|null",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "user@example.com"
    }
  },
  "errors": null
}
```

### Agent login success (200)

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "dashboard_path": "/agent/dashboard",
    "internal_role": "agent",
    "access_role": "agent",
    "user": {
      "id": 55,
      "name": "Agent User",
      "email": "agent@example.com",
      "onboarding_status": "active"
    }
  },
  "errors": null
}
```

### Shared auth invalid role / invalid credentials (401)

```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "data": null,
  "errors": {
    "email": [
      "Credentials are invalid, role is not permitted for this endpoint, or onboarding is not complete."
    ]
  }
}
```

### Agent login invalid role / invalid credentials (401)

```json
{
  "success": false,
  "message": "Invalid credentials or onboarding not completed.",
  "data": null,
  "errors": {
    "email": ["Credentials are invalid or onboarding is not complete."]
  }
}
```

## Role Validation Matrix

| User type        | `/api/v1/auth/login` | `/api/v1/agent/login` |
| ---------------- | -------------------- | --------------------- |
| Self-serve admin | ✅                   | ❌                    |
| Enterprise admin | ✅                   | ❌                    |
| Supervisor       | ✅                   | ❌                    |
| Agent            | ❌                   | ✅                    |

## Route Access Matrix

| Endpoint Namespace | Owner/Admin/Supervisor | Agent    |
| ------------------ | ---------------------- | -------- |
| `/api/v1/admin/*`  | ✅                     | ❌ (403) |
| `/api/v1/agent/*`  | ❌ (403)               | ✅       |

## Error Handling

Status codes:

1. `200` - login success
2. `401` - invalid credentials, invalid role for endpoint, inactive account, or onboarding incomplete
3. `422` - request validation error
4. `429` - rate limit exceeded

Validation rules for both login requests:

1. `email` - required, valid RFC email, max 255
2. `password` - required, string, min 8, max 255

## Security Considerations

1. Passwords are hashed and verified securely.
2. Bearer tokens are generated with 30-day expiration.
3. Error responses remain generic and do not leak sensitive account state.
4. Endpoint-level role gating prevents cross-role login entry misuse.
5. Logout endpoint (`POST /api/v1/auth/logout`) revokes only the current token, leaving other sessions active.

## Logout

### Request

```bash
curl -X POST http://localhost:8080/api/v1/auth/logout \
  -H "Accept: application/json" \
  -H "Authorization: Bearer <token>"
```

### Success Response (200)

```json
{
  "success": true,
  "message": "Logged out successfully.",
  "data": null,
  "errors": null
}
```

### Unauthenticated (401)

```json
{
  "success": false,
  "message": "Unauthenticated.",
  "data": null,
  "errors": null
}
```

## End-to-End Authentication Lifecycle

### Self-serve onboarding flow

1. `POST /api/v1/auth/register` creates pending user and sends OTP.
2. `POST /api/v1/auth/verify-email` verifies OTP and returns bearer token.
3. Frontend stores token immediately and sets `Authorization: Bearer <token>`.
4. `POST /api/v1/onboarding/workspace` completes workspace onboarding and rotates auth token.
5. Frontend replaces previously stored token with `data.token` from workspace completion response.
6. `GET /api/v1/user/me` returns normalized onboarding state and active company context.

Self-serve onboarding completion success payload (`201`):

```json
{
  "success": true,
  "message": "Workspace created successfully. Welcome aboard!",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "workspace": {
      "id": 10,
      "name": "Acme Corp"
    },
    "user": {
      "id": 1,
      "email": "owner@example.com",
      "onboarding_completed": true,
      "user_type": "self-serve"
    },
    "onboarding_completed": true
  }
}
```

### Enterprise onboarding flow

1. `POST /api/v1/enterprise/onboarding/complete` validates request token, activates account, and returns bearer token.
2. Frontend stores token immediately and sets `Authorization: Bearer <token>`.
3. `GET /api/v1/user/me` returns:

- `onboarding_completed=true`
- `enterprise_onboarding_completed=true`
- `user_type=enterprise`
- `active_company` payload

### Login/logout flow

1. `POST /api/v1/auth/login` or `POST /api/v1/agent/login` returns bearer token.
2. `GET /api/v1/user/me` confirms authenticated dashboard context.
3. `POST /api/v1/auth/logout` revokes only the current token.
4. Requests with missing/invalid token receive `401`.

Unified onboarding auth contract:

1. Both completion endpoints return `data.token` and `data.token_type=Bearer`.
2. Frontend must treat completion response token as source of truth and persist before redirect.
3. Dashboard bootstrap must call `/api/v1/user/me`; redirect alone is not authentication state.

## Stabilization and Security Notes

1. Never treat frontend route navigation as authentication proof.
2. Protected APIs (`/api/v1/user/me`, `/api/v1/onboarding/workspace`, projects/tasks endpoints) are enforced by `auth:sanctum` middleware.
3. Tokens are long-lived (30 days) but revocable per-device/session.
4. Active company context is resolved server-side and returned in `user.me` payload.
5. Notification delivery (OTP/welcome/admin alerts) is server-side and independent of token lifecycle; auth changes do not mutate notification records.

## Example Usage

Shared auth login:

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@example.com","password":"password123"}'
```

Agent login:

```bash
curl -X POST http://localhost:8080/api/v1/agent/login \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","password":"password123"}'
```

## Breaking Changes

1. Supervisors no longer use `/api/v1/internal/login`; they must use `/api/v1/auth/login`.
2. New dedicated endpoint introduced for agents: `/api/v1/agent/login`.
3. Legacy `/api/v1/internal/login` is deprecated and reserved for agent backward compatibility only.
