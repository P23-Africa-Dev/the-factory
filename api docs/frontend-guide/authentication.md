# Authentication Frontend Guide

## Feature Overview
Authentication is role-aware and now uses two entry points:

- Shared endpoint (`/api/v1/auth/login`) for:
  - Self-serve admin users
  - Enterprise admin users
  - Supervisors
- Agent endpoint (`/api/v1/agent/login`) for:
  - Agents only

## User Flow
1. User selects login type in UI.
2. Frontend sends credentials to the corresponding endpoint.
3. Backend validates role and onboarding/account status.
4. Frontend stores bearer token and role metadata.
5. Frontend routes user to the correct dashboard.

## API Endpoints
1. `POST /api/v1/auth/login`
2. `POST /api/v1/agent/login`
3. `POST /api/v1/internal/login` only for temporary backward compatibility with older agent clients

## Request Examples
Shared auth login:

```json
{
  "email": "supervisor@example.com",
  "password": "password123"
}
```

Agent login:

```json
{
  "email": "agent@example.com",
  "password": "password123"
}
```

Headers:

- `Content-Type: application/json`
- `Accept: application/json`

## Response Examples
Shared auth success:

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
      "email": "supervisor@example.com"
    }
  }
}
```

Agent success:

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
      "email": "agent@example.com"
    }
  }
}
```

Shared auth error example (wrong endpoint/invalid credentials):

```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "errors": {
    "email": [
      "Credentials are invalid, role is not permitted for this endpoint, or onboarding is not complete."
    ]
  }
}
```

Agent endpoint error example:

```json
{
  "success": false,
  "message": "Invalid credentials or onboarding not completed.",
  "errors": {
    "email": [
      "Credentials are invalid or onboarding is not complete."
    ]
  }
}
```

## Error Handling
1. `401`: show generic auth error and suggest switching endpoint type.
2. `422`: show form validation errors.
3. `429`: show retry delay.
4. `500`: show fallback error and retry option.

Validation rules:

1. `email` is required and must be a valid email address.
2. `password` is required and must be at least 8 characters.

## Frontend Integration Example (Axios/fetch)
```javascript
const API_BASE = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return token
    ? { Accept: 'application/json', Authorization: `Bearer ${token}` }
    : { Accept: 'application/json' };
}

export async function loginSharedAuth(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  localStorage.setItem('user_type', body.data.user_type);
  localStorage.setItem('access_role', body.data.access_role);
  if (body.data.internal_role) {
    localStorage.setItem('internal_role', body.data.internal_role);
  }

  return body.data;
}

export async function loginAgent(email, password) {
  const response = await fetch(`${API_BASE}/agent/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  localStorage.setItem('access_role', body.data.access_role);
  localStorage.setItem('internal_role', body.data.internal_role);

  return body.data;
}
```

## Notes & Edge Cases
1. Supervisors must use shared auth login, not agent login.
2. Agents must use agent login, not shared auth login.
3. Use role metadata (`access_role`, `user_type`, `internal_role`) to route UI after login.
4. Legacy `/api/v1/internal/login` may still exist for compatibility, but new frontend integrations should use `/api/v1/agent/login`.
