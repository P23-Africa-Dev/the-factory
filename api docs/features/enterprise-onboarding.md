# Enterprise Onboarding (Demo-Based, Admin-Controlled)

## Overview

A production-ready, API-first enterprise onboarding lifecycle where admins control registration and activation. All user-facing flows (first-time setup, login) are handled by the Next.js frontend via API calls. Blade is used exclusively for the admin dashboard.

Core stages:
1. Prospect submits demo request via public API.
2. Admin reviews request in the admin dashboard (Blade).
3. Admin registers details and either saves as draft or activates immediately (Blade form → API update).
4. On activation: company & user accounts are created, activation email is sent with a frontend link.
5. User opens the frontend first-time setup page, calls API to validate token and get prefill data, then sets password.
6. User logs in via shared auth endpoint thereafter.

## Architecture Boundary

```
Frontend (Next.js)      Backend (Laravel)       Admin (Blade)
─────────────────       ─────────────────       ─────────────
Demo request form  ──►  POST /enterprise/demo-requests
Setup page         ──►  GET  /enterprise/onboarding/setup-info
                        POST /enterprise/onboarding/complete
Login page         ──►  POST /auth/login
                                                Admin detail ──► PATCH /admin/enterprise/demo-requests/{id}/activate
```

## Lifecycle States

`pending → draft → approved → activated`

- `pending`: Public demo request submitted.
- `draft`: Admin prepared registration payload but has not activated.
- `approved`: Admin activated; setup link issued, user has not completed setup.
- `activated`: User completed first-time setup; token invalidated.

## Data Model

### company_demo_requests

Public request fields (set by prospect):
- `full_name`, `email`, `company_name`, `country`, `team_size`, `use_case`

Admin registration fields:
- `registration_purpose` (workspace purpose enum)
- `registration_user_type` (user type enum)
- `admin_notes`

Lifecycle / security fields:
- `status`, `reviewed_by_admin_id`
- `requested_at`, `reviewed_at`, `approved_at`, `activated_at`
- `activation_token_hash` (SHA-256 of plaintext token)
- `activation_link_expires_at`, `last_activation_sent_at`
- `company_id`, `user_id`

### companies
- `company_id` (e.g. `FAC-XXXX1234`)
- `name`, `country`, `team_size`, `use_case`, `status`

### users
- Standard user record; `is_active`, `enterprise_onboarding_completed_at`

## Public API Endpoints

### Submit Demo Request

`POST /api/v1/enterprise/demo-requests`

```json
{
  "full_name": "Ada Afolabi",
  "email": "ada@acme.com",
  "company_name": "Acme Logistics",
  "country": "NG",
  "team_size": "11-50",
  "use_case": "Need enterprise coordination workflows"
}
```

Response `201`:
```json
{ "success": true, "message": "Demo request submitted successfully.", "data": { "id": 12 }, "errors": null }
```

### Get First-Time Setup Info (Token Validation + Prefill)

`GET /api/v1/enterprise/onboarding/setup-info?request_id=12&token=<64-char-token>`

Called by the frontend immediately on the setup page load to validate the token and retrieve prefill data.

Response `200`:
```json
{
  "success": true,
  "message": "Setup info retrieved successfully.",
  "data": {
    "request_id": 12,
    "email": "ada@acme.com",
    "company_id": "FAC-ABCD1234",
    "company_name": "Acme Logistics"
  },
  "errors": null
}
```

Error `422` — invalid or expired token:
```json
{ "success": false, "message": "Unprocessable Content.", "data": null, "errors": { "token": ["Onboarding token is invalid."] } }
```

### Complete First-Time Setup

`POST /api/v1/enterprise/onboarding/complete`

```json
{
  "request_id": 12,
  "token": "<64-char-token>",
  "company_id": "FAC-ABCD1234",
  "password": "StrongPass!123",
  "password_confirmation": "StrongPass!123"
}
```

Response `200`:
```json
{
  "success": true,
  "message": "Account setup completed successfully.",
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "user": { "id": 7, "email": "ada@acme.com", "user_type": "enterprise" }
  },
  "errors": null
}
```

### Login (Recurring)

`POST /api/v1/auth/login`

```json
{ "email": "ada@acme.com", "password": "StrongPass!123" }
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "token": "1|...",
    "token_type": "Bearer",
    "access_role": "admin",
    "user_type": "enterprise",
    "user": { ... }
  }
}
```

## Admin Web Endpoints (Blade — admin only)

`PATCH /admin/enterprise/demo-requests/{id}/activate`

Form fields (all nullable; fallback to existing demo request values):
- `action` — `"draft"` or `"activate"` (default: activate)
- `full_name`, `email`, `company_name`, `country`, `team_size`
- `purpose`, `user_type`, `admin_notes`

Behaviour:
- `draft`: Updates fields, sets status to `draft`. No email, no company/user created.
- `activate`: Creates company + user, sends activation email, sets status to `approved`.

## Activation Email

Sent to the enterprise user on activation. Contains:
- Company ID
- Email address
- A link to the frontend setup page: `{ENTERPRISE_ONBOARDING_SETUP_URL}?request_id={id}&token={token}`

The token is a 64-character random string, stored in the database as a SHA-256 hash. It expires after `ENTERPRISE_ACTIVATION_LINK_TTL_MINUTES` (default 7 days).

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ENTERPRISE_ACTIVATION_LINK_TTL_MINUTES` | Token lifetime in minutes | `10080` (7 days) |
| `ENTERPRISE_DEMO_NOTIFICATION_EMAIL` | Admin notification address | — |
| `ENTERPRISE_COMPANY_ID_PREFIX` | Company ID prefix | `FAC` |
| `ENTERPRISE_ONBOARDING_SETUP_URL` | Frontend first-time setup page URL | `http://localhost:3000/enterprise/setup` |

## Security Guarantees

1. Token is 64 random bytes; stored only as SHA-256 hash — plaintext never persisted.
2. Token validated with `hash_equals` to prevent timing attacks.
3. Token carries its own expiry (`activation_link_expires_at`) checked server-side.
4. After setup completes, `activation_token_hash` is set to `null` — link cannot be reused.
5. Internal-role email addresses are blocked from enterprise activation (`assertEnterpriseEmailEligible`).
6. Activation email points to the frontend URL, not a backend Blade page — no server-side HTML rendering for user flows.
7. Admin panel protected by `auth:admin` + `admin.active` middleware.

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Duplicate pending/draft/approved email | `DomainException` — request rejected at submission |
| Admin saves draft without activating | Status = `draft`; no side effects |
| Token expired | `GET setup-info` returns 422 |
| Wrong token submitted | `GET setup-info` returns 422 |
| Setup attempted after completion | `POST complete` returns 422 (status is `activated`, not `approved`) |
| Internal-role email used in activation | Service throws 422 before company/user creation |

## Test Coverage

- `AdminActivationTest`: draft save, activate, payload override
- `FirstTimeSetupTest`: setup-info valid/invalid/expired token, complete flow, link reuse prevention
- `EnterpriseLoginTest`: post-activation login, suspended user, shared auth endpoint
- `BookDemoRequestTest`: submission, duplicate prevention
