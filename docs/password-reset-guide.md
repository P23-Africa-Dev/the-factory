# Password Reset And Session Guide

## Overview

This guide covers the complete reset-link flow for both portals.

1. Management portal login route: /login
2. Agent portal login route: /agent/login
3. Forgot password route: /forgot-password
4. Reset password route: /reset-password/{token}

The platform uses secure reset links only.

## Forgot Password Flow

### User Journey

1. User enters email on login page.
2. Login fails.
3. User clicks Forgot Password.
4. Email is prefilled on /forgot-password.
5. User submits request.
6. Backend responds with a generic success message.
7. If account is eligible, user receives a reset link email.

### Frontend API Call

Endpoint:

POST /api/v1/auth/forgot-password

Request body:

```json
{
  "email": "user@example.com",
  "portal": "management"
}
```

Portal values:

1. management
2. agent

Success response:

```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent.",
  "data": null,
  "errors": null
}
```

### UI State Handling

1. Show loading state while request is in-flight.
2. Always show the backend generic success message.
3. Do not display account existence hints.
4. If backend validation fails, render field-level error for email or portal.

## Reset Password Flow

### Reset Link Format

Email link format:

/reset-password/{token}?email=user@example.com&portal=management

### Token Validation Call

Endpoint:

GET /api/v1/auth/reset-password/{token}?email=user@example.com&portal=management

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

Invalid response:

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

### Reset Submission Call

Endpoint:

POST /api/v1/auth/reset-password

Request body:

```json
{
  "email": "user@example.com",
  "token": "reset-token-from-link",
  "password": "Newpassword123",
  "password_confirmation": "Newpassword123",
  "portal": "management"
}
```

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

Validation handling:

1. Show inline password and confirmation errors.
2. If token error is returned, disable submission and ask user to request a new reset link.
3. On success, redirect to returned redirect_path with reset=success query.

## Authentication Redirect Logic

### Logged-In Users Visiting Login

1. /login redirects to /dashboard when auth cookie exists.
2. /agent/login redirects to /agent/dashboard when auth cookie exists.

### Guest Access Protection

1. Management protected routes under app/(dashboard) require auth cookie and redirect guests to /login.
2. Agent protected routes under app/agent require auth cookie and redirect guests to /agent/login.
3. Client-side role guards enforce role-specific dashboard access.

## Logout Behavior

### Management And Agent

1. Frontend calls POST /api/v1/auth/logout with bearer token.
2. Backend revokes current Sanctum token.
3. Frontend clears auth cookies and persisted user state.
4. Redirect target:
5. Management: /login
6. Agent: /agent/login

## Security Notes

1. Reset tokens are secure, expirable, and single-use.
2. Default expiration is 60 minutes (Laravel auth.passwords.users.expire).
3. Reset requests are rate-limited by API throttles.
4. Responses avoid account enumeration.
5. Password reset revokes existing Sanctum sessions for the user.
