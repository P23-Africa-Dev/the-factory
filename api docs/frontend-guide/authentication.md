# Authentication Frontend Guide

## Feature Overview

Authentication is role-aware and uses one Sanctum token system with two entry points:

- Shared endpoint (`/api/v1/auth/login`) for:
  - Owner
  - Admin
  - Supervisor
- Agent endpoint (`/api/v1/agent/login`) for:
  - Agents only

## User Flow

1. User selects login type in UI.
2. Frontend sends credentials to the corresponding endpoint.
3. Backend validates role, onboarding/account status, and active company membership.
4. Frontend stores bearer token and role metadata.
5. Frontend routes user using backend-provided `dashboard_path`.

## API Endpoints

1. `POST /api/v1/auth/login`
2. `POST /api/v1/auth/register`
3. `POST /api/v1/auth/verify-email`
4. `POST /api/v1/onboarding/workspace` (authenticated)
5. `POST /api/v1/enterprise/onboarding/complete`
6. `POST /api/v1/auth/logout` (authenticated)
7. `POST /api/v1/agent/login`
8. `POST /api/v1/internal/login` only for temporary backward compatibility with older agent clients
9. `GET /api/v1/user/me` to fetch authenticated user and active company context
10. Management-protected namespace: `/api/v1/admin/*`
11. Agent-protected namespace: `/api/v1/agent/*`

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
    "dashboard_path": "/dashboard",
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

Authenticated profile response (dashboard bootstrap):

```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "owner@example.com",
    "onboarding_completed": true,
    "enterprise_onboarding_completed": true,
    "user_type": "enterprise",
    "active_company": {
      "id": 10,
      "company_id": "FAC-ABCD1234",
      "name": "Acme Co",
      "status": "active",
      "role": "owner"
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
    "dashboard_path": "/agent/dashboard",
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
    "email": ["Credentials are invalid or onboarding is not complete."]
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
const API_BASE = "/api/v1";

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token
    ? { Accept: "application/json", Authorization: `Bearer ${token}` }
    : { Accept: "application/json" };
}

export async function loginSharedAuth(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem("auth_token", body.data.token);
  localStorage.setItem("user_type", body.data.user_type);
  localStorage.setItem("access_role", body.data.access_role);
  if (body.data.internal_role) {
    localStorage.setItem("internal_role", body.data.internal_role);
  }

  return body.data;
}

export async function verifyEmailOtp(email, otpCode) {
  const response = await fetch(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, otp_code: otpCode }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  // Critical: persist token before redirecting to onboarding/dashboard
  localStorage.setItem("auth_token", body.data.token);

  return body.data;
}

export async function completeEnterpriseOnboarding(payload) {
  const response = await fetch(`${API_BASE}/enterprise/onboarding/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  // Critical: persist token before redirecting to dashboard
  localStorage.setItem("auth_token", body.data.token);

  return body.data;
}

export async function createWorkspace(payload) {
  const response = await fetch(`${API_BASE}/onboarding/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  // Self-serve onboarding completion now rotates token.
  // Persist the returned token before dashboard redirect.
  localStorage.setItem("auth_token", body.data.token);

  return body.data;
}

export async function loginAgent(email, password) {
  const response = await fetch(`${API_BASE}/agent/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem("auth_token", body.data.token);
  localStorage.setItem("access_role", body.data.access_role);
  localStorage.setItem("internal_role", body.data.internal_role);

  return body.data;
}

export function resolveDashboardPath(loginData) {
  return loginData?.dashboard_path || "/dashboard";
}

export async function getMe() {
  const response = await fetch(`${API_BASE}/user/me`, {
    headers: authHeaders(),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  // Always bind active company context from backend response
  const activeCompany = body.data.active_company;
  if (activeCompany?.id) {
    localStorage.setItem("active_company_id", String(activeCompany.id));
    localStorage.setItem("active_company_code", activeCompany.company_id);
    localStorage.setItem("active_company_role", activeCompany.role);
  }

  return body.data;
}

export async function logout() {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });

  const body = await response.json();

  // Always clear local auth state regardless of response body
  localStorage.removeItem("auth_token");
  localStorage.removeItem("user_type");
  localStorage.removeItem("access_role");
  localStorage.removeItem("internal_role");
  localStorage.removeItem("active_company_id");
  localStorage.removeItem("active_company_code");
  localStorage.removeItem("active_company_role");

  return { ok: response.ok, body };
}
```

## Notes & Edge Cases

1. Supervisors must use shared auth login, not agent login.
2. Agents must use agent login, not shared auth login.
3. Use role metadata (`access_role`, `user_type`, `internal_role`) to route UI after login.
4. Prefer `dashboard_path` from login response as the source of truth for post-login redirect.
5. Legacy `/api/v1/internal/login` may still exist for compatibility, but new frontend integrations should use `/api/v1/agent/login`.
6. Use `/api/v1/admin/*` for management dashboard APIs and `/api/v1/agent/*` for agent dashboard APIs.
7. For company-scoped APIs, prefer omitting `company_id` unless user explicitly switches company context.
8. If sending `company_id`, use `active_company.id` from `/api/v1/user/me`; do not use `user.id`.
9. Do not redirect to dashboard until token is persisted and `GET /api/v1/user/me` succeeds.
10. Use `data.onboarding_completed` from `/api/v1/user/me` as canonical dashboard gate across self-serve and enterprise users.
11. If `GET /api/v1/user/me` returns `401`, clear local auth state and route to login.
12. After self-serve workspace completion, replace pre-onboarding token with `data.token` from `/api/v1/onboarding/workspace` response.
