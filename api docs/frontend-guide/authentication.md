# Authentication Frontend Guide

## Feature Overview
Authentication is role-aware with two login entry points.
- Admin-level users: self-serve and enterprise
- Internal users: agent and supervisor

## User Flow
1. User selects login type in UI (Admin or Internal).
2. Frontend sends credentials to the matching endpoint.
3. Backend validates role + account state.
4. Frontend stores token and role metadata.
5. App routes user to role-appropriate dashboard.

## API Endpoints
- POST /api/auth/login (Admin-level)
- POST /api/internal/login (Internal users)

## Request Examples
### Admin Login
```json
{
  "email": "admin@example.com",
  "password": "securepassword123"
}
```

### Internal Login
```json
{
  "email": "agent@example.com",
  "password": "securepassword123"
}
```

## Response Examples
### Admin Success 200
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user_type": "self-serve",
    "user": {
      "id": 1,
      "email": "admin@example.com",
      "name": "John Doe"
    }
  }
}
```

### Internal Success 200
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "2|...",
    "token_type": "Bearer",
    "internal_role": "agent",
    "user": {
      "id": 2,
      "email": "agent@example.com",
      "name": "Jane Agent"
    }
  }
}
```

### Auth Error 401
```json
{
  "success": false,
  "message": "Invalid credentials or account not activated.",
  "errors": {
    "email": ["Credentials are invalid or onboarding is not complete."]
  }
}
```

## Error Handling
- 401: show generic invalid login message.
- 422: show form validation errors.
- 429: show retry timer.
- Wrong endpoint for role can still return 401 behavior; offer login type switch.

## Frontend Integration Example (Axios/fetch)
```javascript
const API = '/api';

export async function login({ email, password, mode }) {
  const endpoint = mode === 'internal' ? '/internal/login' : '/auth/login';

  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();
  if (!res.ok || !body.success) throw body;

  const token = body.data.token;
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_mode', mode);
  if (body.data.user_type) localStorage.setItem('user_type', body.data.user_type);
  if (body.data.internal_role) localStorage.setItem('internal_role', body.data.internal_role);

  return body.data;
}

export function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' };
}
```

## Notes & Edge Cases
- Keep admin and internal login forms visibly separate.
- Token validity is finite; handle 401 on protected routes by forcing re-login.
- Avoid exposing detailed auth failure reasons in UI.
