# Onboarding and Registration Frontend Guide

## Feature Overview
This flow handles new self-serve user onboarding using email OTP and workspace setup.

## User Flow
1. User enters name and email.
2. Frontend calls register endpoint.
3. User enters OTP from email.
4. Frontend verifies OTP and receives bearer token.
5. Frontend stores token and loads user profile.
6. User submits workspace form to complete onboarding.

## API Endpoints
- POST /api/v1/auth/register
- POST /api/v1/auth/verify-email
- POST /api/v1/auth/resend-otp
- GET /api/v1/user/me (requires bearer token)
- POST /api/v1/onboarding/workspace (requires bearer token)

## Request Examples
### Register
```json
{
  "name": "Ridwan Elijah",
  "email": "ridwanelijah@example.com"
}
```

### Verify OTP
```json
{
  "email": "ridwanelijah@example.com",
  "otp_code": "123456"
}
```

### Create Workspace
```json
{
  "company_name": "The Factory Labs",
  "country": "NG",
  "team_size": "2-10",
  "purpose": "startup",
  "user_type": "founder"
}
```

## Response Examples
### Verify Success 200
```json
{
  "success": true,
  "message": "Email verified successfully. Welcome to The Factory!",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "expires_in_days": 30,
    "user": {
      "id": 1,
      "name": "Ridwan Elijah",
      "email": "ridwanelijah@example.com",
      "email_verified": true,
      "onboarding_completed": false
    },
    "onboarding_completed": false
  },
  "errors": null
}
```

### OTP Invalid 422
```json
{
  "success": false,
  "message": "Invalid or expired verification code.",
  "data": null,
  "errors": {
    "otp_code": [
      "The verification code is incorrect or has expired. Please request a new one."
    ]
  }
}
```

## Error Handling
- 422 on OTP validation: show inline field error.
- 429 on resend: disable resend button and show cooldown.
- 409 on workspace completion conflict: route user to dashboard.

## Frontend Integration Example (Axios/fetch)
```javascript
const API = '/api/v1';

export async function register(name, email) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  return res.json();
}

export async function verifyEmail(email, otpCode) {
  const res = await fetch(`${API}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, otp_code: otpCode }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw body;

  localStorage.setItem('auth_token', body.data.token);
  return body.data;
}

export async function createWorkspace(payload) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API}/onboarding/workspace`, {
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
```

## Notes & Edge Cases
- Preserve email between register and verify screens.
- OTP is 6 digits and time-limited.
- Resend is rate-limited plus cooldown.
- Token is required before workspace creation.
