# Role-Aware Authentication System - API Documentation

## System Overview

The platform uses one Sanctum token infrastructure with role-aware login endpoints.

1. Shared management endpoint: /api/v1/auth/login
2. Agent endpoint: /api/v1/agent/login

Dashboard routing contract:

1. Management users receive dashboard_path=/dashboard.
2. Agents receive dashboard_path=/agent/dashboard.

Password reset uses secure reset links only.

1. No OTP reset flow is used.
2. Reset links expire after 60 minutes by default.
3. Tokens are single-use.

## Authentication Roles

### Shared Management Endpoint

POST /api/v1/auth/login

Allowed users:

1. Self-serve admin users
2. Enterprise admin users
3. Supervisors

### Agent Endpoint

POST /api/v1/agent/login

Allowed users:

1. Agents only

## Password Reset Endpoints

### Request Reset Link

POST /api/v1/auth/forgot-password

Request payload:

```json
{
  "email": "user@example.com",
  "portal": "management"
}
```

Validation rules:

1. email: required, valid RFC email, lowercase, max 255
2. portal: optional, one of management or agent

Success response:

```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent.",
  "data": null,
  "errors": null
}
```

Notes:

1. Response is intentionally generic to prevent account enumeration.
2. Links are sent only for accounts that exist, are active, and match portal context.
3. Endpoint is rate-limited.

### Validate Reset Token

GET /api/v1/auth/reset-password/{token}

Required query params:

1. email
2. portal (optional: management or agent)

Success response:

```json
{
  "success": true,
  "message": "Password reset link is valid.",
  "data": {
    "valid": true
  },
  "errors": null
}
```

Error response (invalid, used, or expired):

```json
{
  "success": false,
  "message": "This password reset link is invalid or has expired.",
  "data": null,
  "errors": {
    "token": [
      "The password reset link is invalid, expired, or already used."
    ]
  }
}
```

### Reset Password

POST /api/v1/auth/reset-password

Request payload:

```json
{
  "email": "user@example.com",
  "token": "token-from-link",
  "password": "Newpassword123",
  "password_confirmation": "Newpassword123",
  "portal": "management"
}
```

Validation rules:

1. email: required, valid RFC email, lowercase, max 255
2. token: required, string, min 40
3. password: required, min 8, letters and numbers required
4. password_confirmation: required, must match password
5. portal: optional, one of management or agent

Success response:

```json
{
  "success": true,
  "message": "Password reset successfully.",
  "data": {
    "redirect_path": "/login"
  },
  "errors": null
}
```

Error response:

```json
{
  "success": false,
  "message": "The reset link is invalid or expired.",
  "data": null,
  "errors": {
    "token": [
      "The reset link is invalid, expired, or already used."
    ]
  }
}
```

## Logout Endpoint

POST /api/v1/auth/logout

1. Requires bearer token.
2. Revokes current Sanctum token.
3. Frontend must clear auth cookie and persisted user state after success (or best-effort on failure).

## Status Codes

1. 200 - success
2. 401 - unauthenticated or login failure
3. 422 - validation or invalid/expired reset token
4. 429 - rate limit exceeded

## Security Controls

1. Reset tokens are broker-managed, cryptographically secure, hashed in storage, single-use, and expirable.
2. Default token expiration is 60 minutes.
3. Forgot password response is generic for enumeration resistance.
4. Reset completion revokes existing user Sanctum tokens to protect active sessions.
5. Reset endpoints are throttle-protected.
