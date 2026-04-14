# Internal User Onboarding Frontend Guide

## Feature Overview
This feature enables managers to create, invite, and activate internal users (agents/supervisors), including optional prefilled profile data.

## User Flow
1. Manager creates internal user profile.
2. Backend sends invite email with secure link.
3. Invited user opens link and frontend calls preview endpoint.
4. Frontend renders prefilled phone/gender/avatar + editable fields.
5. User submits password and optional overrides.
6. Backend activates account and returns token.
7. User logs in through internal login endpoint.

## API Endpoints
Public:
- POST /api/v1/internal/login
- POST /api/v1/internal/onboarding/preview
- POST /api/v1/internal/onboarding/complete

Authenticated:
- POST /api/v1/internal-users
- POST /api/v1/internal-users/{user}/invite
- PATCH /api/v1/internal-users/{user}/supervisor

## Request Examples
### Create Internal User
```json
{
  "company_id": 1,
  "full_name": "Abdul Donald",
  "email": "abduldonald@factory.local",
  "role": "agent",
  "phone_number": "+2348012345678",
  "gender": "male",
  "avatar_key": "male_02",
  "assigned_zone": "Lagos Mainland",
  "work_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "base_salary": 150000,
  "currency_code": "NGN",
  "commission_enabled": true,
  "supervisor_user_id": 14
}
```

### Preview Invite
```json
{
  "invitation_id": 101,
  "token": "<64-char-token>"
}
```

### Complete Onboarding
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

## Response Examples
### Preview Success 200
```json
{
  "success": true,
  "message": "Invitation is valid.",
  "data": {
    "user": {
      "id": 55,
      "name": "Abdul Donald",
      "email": "abduldonald@factory.local",
      "internal_role": "agent",
      "onboarding_status": "pending_onboarding"
    },
    "prefilled_data": {
      "phone_number": "+2348012345678",
      "gender": "male",
      "avatar_key": "male_02"
    },
    "avatar_options_by_gender": {
      "male": {},
      "female": {}
    },
    "expires_at": "2026-04-11T13:00:00+00:00"
  }
}
```

### Complete Success 200
```json
{
  "success": true,
  "message": "Onboarding completed successfully.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user": {
      "id": 55,
      "internal_role": "agent",
      "onboarding_status": "active",
      "is_active": true
    }
  }
}
```

## Error Handling
- 422 on invalid/expired token: show invite expired screen.
- 422 on profile validation: show field-level feedback.
- 401 on login for non-active internal user: show onboarding incomplete message.
- 429: show retry timer.

## Frontend Integration Example (Axios/fetch)
```javascript
const API = '/api/v1';

export async function createInternalUser(payload, token) {
  const res = await fetch(`${API}/internal-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function previewInternalInvite(invitationId, token) {
  const res = await fetch(`${API}/internal/onboarding/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ invitation_id: invitationId, token }),
  });
  return res.json();
}

export async function completeInternalOnboarding(payload) {
  const res = await fetch(`${API}/internal/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await res.json();
  if (!res.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  return body.data;
}
```

## Notes & Edge Cases
- Prefilled profile values are editable by invited user.
- If gender is provided without avatar, backend may auto-select avatar.
- Invite links are signed, time-limited, and one-time use.
- Agent creation usually requires supervisor assignment.
