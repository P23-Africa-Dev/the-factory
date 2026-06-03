# Onboarding and Registration Frontend Guide

## Feature Overview
This flow handles new self-serve user onboarding using password setup, email OTP verification, and workspace setup.

## User Flow
1. User enters name, email, password, and password confirmation.
2. Frontend calls register endpoint.
3. User enters OTP from email.
4. Frontend verifies OTP and receives bearer token.
5. Frontend stores token and loads user profile.
6. User submits workspace form to complete onboarding.
7. Backend creates both workspace and company membership (`company_users.role=owner`) in the same transaction.
8. Frontend calls `GET /api/v1/user/me` and stores `active_company.id` as the canonical tenant context.
9. User can immediately sign in from login screen using the same email and password.

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
  "email": "ridwanelijah@example.com",
  "password": "Secure123",
  "password_confirmation": "Secure123"
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

### Weak Password 422
```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "password": [
      "Password must contain at least one number."
    ]
  }
}
```

### Password Mismatch 422
```json
{
  "success": false,
  "message": "The given data was invalid.",
  "data": null,
  "errors": {
    "password_confirmation": [
      "Password confirmation does not match."
    ]
  }
}
```

## Error Handling
- 422 on register password validation: show inline field errors under `password`/`password_confirmation`.
- 422 on OTP validation: show inline field error.
- 429 on resend: disable resend button and show cooldown.
- 409 on workspace completion conflict: route user to dashboard.

## Frontend Integration Example (Axios/fetch)
```javascript
const API = '/api/v1';

export async function register(name, email, password, passwordConfirmation) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    }),
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

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();
  if (!res.ok || !body.success) throw body;
  return body.data;
}

export async function getMe() {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`${API}/user/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await res.json();
  if (!res.ok || !body.success) throw body;

  if (body.data.active_company?.id) {
    localStorage.setItem('active_company_id', String(body.data.active_company.id));
  }

  return body.data;
}
```

## Notes & Edge Cases
- Preserve email between register and verify screens.
- OTP is 6 digits and time-limited.
- Resend is rate-limited plus cooldown.
- Token is required before workspace creation.
- Use `active_company.id` from `/api/v1/user/me` for company-scoped requests that require `company_id`.
- Never send `user.id` as `company_id`; they are different entities.
- Password is created at registration and should never be stored in frontend state longer than needed.
- Existing OTP/email verification logic remains the same; password setup does not bypass verification.
