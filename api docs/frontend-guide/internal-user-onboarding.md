# Internal User Onboarding Frontend Guide

## Feature Overview
This feature allows managers to create and onboard internal users while preserving role-specific login entry points.

## User Flow
1. Manager creates internal user profile.
2. Backend sends onboarding invitation link.
3. Invited user opens link and frontend previews invitation.
4. User sets password and optionally updates prefilled profile fields.
5. Backend activates user and returns token.
6. Login behavior after onboarding:
   - Agent -> `/api/v1/agent/login`
   - Supervisor -> `/api/v1/auth/login`

## API Endpoints
Public:
1. `POST /api/v1/agent/login`
2. `GET /api/v1/avatars?gender=male|female`
3. `POST /api/v1/internal/onboarding/preview`
4. `POST /api/v1/internal/onboarding/complete`

Authenticated:
1. `GET /api/v1/internal-users`
2. `GET /api/v1/internal-users/onboarding-status`
3. `POST /api/v1/internal-users`
4. `POST /api/v1/internal-users/{user}/invite`
5. `PATCH /api/v1/internal-users/{user}/supervisor`

Manager follow-up query examples:
1. `GET /api/v1/internal-users?include_inactive=1&company_id=FAC-ABCD1234`
2. `GET /api/v1/internal-users?onboarding_status=pending_onboarding&company_id=FAC-ABCD1234`
3. `GET /api/v1/internal-users/onboarding-status?company_id=FAC-ABCD1234`

## Request Examples
Create user:

```json
{
  "company_id": 1,
  "full_name": "Abdul Donald",
  "email": "abduldonald@factory.local",
  "role": "agent",
  "assigned_zone": "Lagos Mainland",
  "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "base_salary": 150000,
  "currency_code": "NGN",
  "commission_enabled": true,
  "supervisor_user_id": 14
}
```

Complete onboarding:

```json
{
  "invitation_id": 101,
  "token": "<64-char-token>",
  "password": "StrongPass!123",
  "password_confirmation": "StrongPass!123",
  "phone_number": "+2348012345678",
  "gender": "male",
  "avatar_key": "male_02"
}
```

Agent login:

```json
{
  "email": "abduldonald@factory.local",
  "password": "StrongPass!123"
}
```

## Response Examples
Onboarding status dashboard success:

```json
{
  "success": true,
  "message": "Internal onboarding status retrieved successfully",
  "data": {
    "summary": {
      "total": 12,
      "active": 9,
      "pending_onboarding": 3,
      "inactive": 3
    },
    "items": [
      {
        "id": 55,
        "name": "Abdul Donald",
        "email": "abduldonald@factory.local",
        "role": "agent",
        "onboarding_status": "pending_onboarding",
        "is_active": false,
        "internal_onboarding_completed_at": null,
        "invite_sent_at": "2026-04-28T07:05:00+00:00",
        "invite_expires_at": "2026-05-01T07:05:00+00:00",
        "invite_accepted_at": null,
        "invite_revoked_at": null
      }
    ]
  },
  "errors": null
}
```

Invitation preview success:

```json
{
  "success": true,
  "message": "Invitation is valid.",
  "data": {
    "user": {
      "id": 55,
      "name": "Abdul Donald",
      "email": "abduldonald@factory.local"
    },
    "prefilled_data": {
      "phone_number": "+2348012345678",
      "gender": "male",
      "avatar_key": "male_02"
    },
    "avatar_options": [
      {
        "key": "avatar_1",
        "url": "http://localhost/storage/avatar/male/avatar_1.png",
        "svg": null
      }
    ],
    "expires_at": "2026-04-11T13:00:00+00:00"
  }
}
```

Avatar list success:

```json
{
  "success": true,
  "data": [
    "http://localhost/storage/avatar/male/avatar_1.png",
    "http://localhost/storage/avatar/male/avatar_2.png"
  ]
}
```

Agent login success:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "internal_role": "agent",
    "access_role": "agent"
  }
}
```

## Error Handling
1. `422` for invalid/expired invitation token.
2. `422` for profile/password validation errors.
3. `401` for wrong role endpoint usage during login.
4. `429` for throttled requests.

## Frontend Integration Example (Axios/fetch)
```javascript
const API_BASE = '/api/v1';

export async function previewInvite(invitationId, token) {
  const response = await fetch(`${API_BASE}/internal/onboarding/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ invitation_id: invitationId, token }),
  });
  return response.json();
}

export async function completeOnboarding(payload) {
  const response = await fetch(`${API_BASE}/internal/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
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
  localStorage.setItem('internal_role', body.data.internal_role);
  localStorage.setItem('access_role', body.data.access_role);

  return body.data;
}
```

## Notes & Edge Cases
1. Use preview payload to prefill UI form fields.
2. Allow users to override prefilled phone/gender/avatar before completion.
3. Supervisors should not use agent login endpoint.
4. Avatar URL list is gender-specific and publicly accessible through storage link.
5. For new integrations, avoid deprecated `/api/v1/internal/login` and use role-specific current endpoints.
