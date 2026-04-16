# Role-Aware Authentication System - API Documentation

## System Overview

The authentication system now uses two role-based entry points:

- Shared auth endpoint: `/api/v1/auth/login`
  - Self-serve admin users
  - Enterprise admin users
  - Supervisor users
- Agent endpoint: `/api/v1/agent/login`
  - Agent users only

Backward compatibility:

- `/api/v1/internal/login` remains available as a deprecated alias for agents only.

## Authentication Roles

### Shared Auth Endpoint (`POST /api/v1/auth/login`)

Allowed users:

1. Self-serve admin users (`internal_role = null`, onboarding complete)
2. Enterprise admin users (`internal_role = null`, enterprise onboarding complete)
3. Supervisors (`internal_role = supervisor`, `onboarding_status = active`)

### Agent Endpoint (`POST /api/v1/agent/login`)

Allowed users:

1. Agents only (`internal_role = agent`, `onboarding_status = active`)

## Endpoints

1. `POST /api/v1/auth/login`
2. `POST /api/v1/agent/login`
3. `POST /api/v1/internal/login` (deprecated alias for agents only)

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

### Shared auth success (200)

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
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
    "email": [
      "Credentials are invalid or onboarding is not complete."
    ]
  }
}
```

## Role Validation Matrix

| User type | `/api/v1/auth/login` | `/api/v1/agent/login` |
| --- | --- | --- |
| Self-serve admin | ✅ | ❌ |
| Enterprise admin | ✅ | ❌ |
| Supervisor | ✅ | ❌ |
| Agent | ❌ | ✅ |

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
2. Bearer tokens are generated with expiration.
3. Error responses remain generic and do not leak sensitive account state.
4. Endpoint-level role gating prevents cross-role login entry misuse.

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
