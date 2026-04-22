# Enterprise Onboarding — Frontend Integration Guide

## Architecture

This is an API-first flow. Laravel handles all backend logic. The Next.js frontend owns all user-facing pages. There are no Blade views for enterprise user flows.

```
Email link
   │
   ▼
Next.js setup page (/enterprise/setup?request_id=X&token=Y)
   │
   ├─► GET  /api/v1/enterprise/onboarding/setup-info   (validate token, get prefill)
   └─► POST /api/v1/enterprise/onboarding/complete      (set password, get auth token)
```

## Frontend Surfaces

1. Public demo request form — calls `POST /api/v1/enterprise/demo-requests`.
2. First-time setup page — receives `request_id` + `token` as query params from the activation email link. Calls `setup-info` then `complete`.
3. Login page — `POST /api/v1/auth/login`.

**There is no `/login` or `/onboarding/enterprise/first-time` Blade route.** The backend `GET /` serves only a developer API status page.

---

## Step-by-Step Frontend Flow

### 1. User Receives Activation Email

The email contains a link to your Next.js page, e.g.:

```
https://app.factory23.com/enterprise/setup?request_id=12&token=<64-char-token>
```

`request_id` and `token` come from query params. Do not store them in localStorage until setup is complete.

---

### 2. On Page Mount — Validate Token & Fetch Prefill Data

`GET /api/v1/enterprise/onboarding/setup-info`

Query params: `request_id`, `token`

**Request:**
```
GET /api/v1/enterprise/onboarding/setup-info?request_id=12&token=aaaa...64chars
Accept: application/json
```

**Success `200`:**
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

**Failure `422` (invalid/expired token):**
```json
{
  "success": false,
  "message": "Unprocessable Content.",
  "data": null,
  "errors": {
    "token": ["Onboarding token is invalid."]
  }
}
```

**UI rule:** If `setup-info` fails, show an "invalid or expired link" error and do not render the password form. Do not redirect to login.

**UI rule:** `email` and `company_id` from `data` must be displayed as read-only fields — the user cannot edit them.

---

### 3. User Sets Password

Show a form with:
- `email` (read-only, prefilled from step 2)
- `company_id` (read-only, prefilled from step 2)
- `password` (new password input)
- `password_confirmation`

On submit → `POST /api/v1/enterprise/onboarding/complete`

**Request:**
```json
{
  "request_id": 12,
  "token": "<token from query param>",
  "company_id": "FAC-ABCD1234",
  "password": "StrongPass!123",
  "password_confirmation": "StrongPass!123"
}
```

**Success `200`:**
```json
{
  "success": true,
  "message": "Account setup completed successfully.",
  "data": {
    "token": "1|abc...",
    "token_type": "Bearer",
    "user": {
      "id": 7,
      "name": "Ada Afolabi",
      "email": "ada@acme.com",
      "user_type": "enterprise",
      "access_role": "admin"
    }
  },
  "errors": null
}
```

**After success:**
- Persist `token` (e.g. in a secure cookie or localStorage).
- Redirect user to the enterprise dashboard.

---

### 4. Recurring Login

`POST /api/v1/auth/login`

```json
{ "email": "ada@acme.com", "password": "StrongPass!123" }
```

Response structure is identical to the `complete` response — token + user object.

---

## Error Handling Reference

| Scenario | Status | `errors` key | Recommended UX |
|---|---|---|---|
| Invalid token | 422 | `token` | Show "link is invalid or expired" message |
| Expired token | 422 | `token` | Same as above; suggest contacting support |
| Passwords don't match | 422 | `password_confirmation` | Inline field error |
| Password too weak | 422 | `password` | Inline field error |
| Token already used | 422 | `request_id` | Show "setup already completed" message |
| Wrong company_id | 422 | `company_id` | Should not happen if prefill is used correctly |

---

## Full Integration Snippet (TypeScript)

```typescript
// 1. On setup page mount
const params = new URLSearchParams(window.location.search);
const requestId = params.get('request_id');
const token = params.get('token');

const infoRes = await fetch(
  `/api/v1/enterprise/onboarding/setup-info?request_id=${requestId}&token=${token}`,
  { headers: { Accept: 'application/json' } }
);
const info = await infoRes.json();

if (!infoRes.ok) {
  // Show error — do not render form
  return;
}

const { email, company_id, company_name } = info.data;

// 2. User submits form
const completeRes = await fetch('/api/v1/enterprise/onboarding/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    request_id: Number(requestId),
    token,
    company_id,
    password,
    password_confirmation,
  }),
});
const result = await completeRes.json();

if (completeRes.ok) {
  localStorage.setItem('auth_token', result.data.token);
  router.push('/dashboard');
}
```

---

## Demo Request Submission

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

Valid `team_size` values: `"2-10"`, `"11-50"`, `"51-200"`, `"201-500"`, `"501+"`.  
Valid `country`: ISO 3166-1 alpha-2 (2-letter code, e.g. `"NG"`, `"GB"`, `"US"`).

---

## Notes for Frontend Engineers

- **Never** redirect enterprise users to `/login` (the Blade admin login). Their entry point is `/api/v1/auth/login` (JSON).
- The `company_id` must be sent in the `complete` request even though it is readonly on the form — it is validated server-side.
- Throttle limits: `setup-info` is limited to 20 requests/minute per IP; `complete` to 10/minute.
- The activation token is single-use and time-limited (default 7 days). After the `complete` call succeeds, the token is invalidated.
