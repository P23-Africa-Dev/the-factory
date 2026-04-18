# Onboarding & Registration API

## Overview

This feature supports the 3-step self-serve onboarding flow:

1. Register with full name + email + password
2. Verify email with 6-digit OTP
3. Create workspace profile

Users now set their login password during registration. OTP verification remains required for email ownership validation and token issuance.

## Endpoints

1. `POST /api/v1/auth/register`
2. `POST /api/v1/auth/verify-email`
3. `POST /api/v1/auth/resend-otp`
4. `GET /api/v1/user/me`
5. `POST /api/v1/onboarding/workspace`

## Authentication

- Public endpoints:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/verify-email`
  - `POST /api/v1/auth/resend-otp`
- Bearer token required:
  - `GET /api/v1/user/me`
  - `POST /api/v1/onboarding/workspace`

Token type is Sanctum bearer token returned by `verify-email`.

## Request & Response Contracts

### 1) Register

`POST /api/v1/auth/register`

Request:

```json
{
  "name": "Ridwon Elijah",
  "email": "ridwanelijah@example.com",
  "password": "Secure123",
  "password_confirmation": "Secure123"
}
```

Success (`201`):

```json
{
  "success": true,
  "message": "Verification code sent. Please check your email.",
  "data": {
    "email": "ri**@example.com"
  },
  "errors": null
}
```

### 2) Verify Email OTP

`POST /api/v1/auth/verify-email`

Request:

```json
{
  "email": "ridwanelijah@example.com",
  "otp_code": "123456"
}
```

Success (`200`):

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
      "avatar": null,
      "email_verified": true,
      "onboarding_completed": false,
      "onboarding_completed_at": null,
      "created_at": "2026-04-03T14:30:00+00:00"
    },
    "onboarding_completed": false
  },
  "errors": null
}
```

Failure (`422`, invalid or expired OTP):

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

Failure (`422`, weak or invalid password):

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

Failure (`422`, password confirmation mismatch):

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

### 3) Resend OTP

`POST /api/v1/auth/resend-otp`

Request:

```json
{
  "email": "ridwanelijah@example.com"
}
```

Success (`200`):

```json
{
  "success": true,
  "message": "A new verification code has been sent to your email.",
  "data": {
    "email": "ri**@example.com"
  },
  "errors": null
}
```

Cooldown failure (`429`):

```json
{
  "success": false,
  "message": "Please wait before requesting another code.",
  "data": null,
  "errors": {
    "email": [
      "A verification code was recently sent. Please wait 60 seconds before trying again."
    ]
  }
}
```

### 4) Current User

`GET /api/v1/user/me`

Headers:

```txt
Authorization: Bearer <token>
```

Success (`200`):

```json
{
  "success": true,
  "message": "User profile fetched successfully.",
  "data": {
    "id": 1,
    "name": "Ridwan Elijah",
    "email": "ridwanelijah@example.com",
    "avatar": null,
    "email_verified": true,
    "onboarding_completed": false,
    "onboarding_completed_at": null,
    "created_at": "2026-04-03T14:30:00+00:00"
  },
  "errors": null
}
```

### 5) Create Workspace

`POST /api/v1/onboarding/workspace`

Headers:

```txt
Authorization: Bearer <token>
```

Request:

```json
{
  "company_name": "The Factory Labs",
  "country": "NG",
  "team_size": "2-10",
  "purpose": "startup",
  "user_type": "founder"
}
```

Success (`201`):

```json
{
  "success": true,
  "message": "Workspace created successfully. Welcome aboard!",
  "data": {
    "workspace": {
      "id": "01JQ7MZX6R7DJ9GM5T7QKEB3DF",
      "name": "The Factory Labs",
      "slug": "the-factory-labs",
      "country": "NG",
      "team_size": "2-10",
      "purpose": "startup",
      "user_type": "founder",
      "created_at": "2026-04-03T14:40:00+00:00"
    },
    "user": {
      "id": 1,
      "name": "Ridwan Elijah",
      "email": "ridwanelijah@example.com",
      "avatar": null,
      "email_verified": true,
      "onboarding_completed": true,
      "onboarding_completed_at": "2026-04-03T14:40:00+00:00",
      "created_at": "2026-04-03T14:30:00+00:00"
    }
  },
  "errors": null
}
```

Conflict (`409`, onboarding already completed):

```json
{
  "success": false,
  "message": "Onboarding has already been completed.",
  "data": null,
  "errors": null
}
```

## Validation Rules

- Register:
  - `name`: required, string, min 2, max 255
  - `email`: required, valid RFC email, max 255
  - `password`: required, string, min 8, must contain at least one letter and one number
  - `password_confirmation`: required, must match `password`
- Verify email:
  - `email`: required, exists in users
  - `otp_code`: required, exactly 6 digits
- Resend OTP:
  - `email`: required, exists in users
- Create workspace:
  - `company_name`: required, string, min 2, max 255
  - `country`: required, 2 letters only (ISO-2 style)
  - `team_size`: one of `solo`, `2-10`, `11-50`, `51-200`, `201-500`, `500+`
  - `purpose`: one of `personal`, `startup`, `enterprise`, `freelancing`, `education`, `non_profit`, `other`
  - `user_type`: one of `developer`, `designer`, `product_manager`, `marketing`, `sales`, `operations`, `founder`, `student`, `other`

## Rate Limits

- `POST /auth/register`: `5` requests per minute
- `POST /auth/verify-email`: `10` requests per minute
- `POST /auth/resend-otp`: `3` requests per 10 minutes + OTP cooldown guard of 60 seconds
- `POST /onboarding/workspace`: `10` requests per minute

## cURL Examples

Register:

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ridwan Elijah","email":"ridwanelijah@example.com","password":"Secure123","password_confirmation":"Secure123"}'
```

Verify:

```bash
curl -X POST http://localhost:8080/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"ridwanelijah@example.com","otp_code":"123456"}'
```

Create workspace:

```bash
curl -X POST http://localhost:8080/api/v1/onboarding/workspace \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"The Factory Labs","country":"NG","team_size":"2-10","purpose":"startup","user_type":"founder"}'
```

## Authentication Impact

- Registration now stores a hashed password immediately.
- After the user completes onboarding (`verify-email` + `onboarding/workspace`), they can log in right away using:
  - `POST /api/v1/auth/login`
  - `email` + `password` (set during registration)
- Existing OTP verification logic is unchanged and still required for email ownership confirmation.
