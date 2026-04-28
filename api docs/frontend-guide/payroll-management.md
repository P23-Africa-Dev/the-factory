# Payroll Management Frontend Guide

## Feature Overview

Payroll settings are company-level configuration records used to standardize compensation logic for all agents in a tenant.

Key behavior:

1. Owners, admins, and supervisors can create and update payroll settings.
2. Agents inherit the configured payroll policy and can only fetch it.
3. `daily_pay` is auto-calculated by backend from `base_salary` and `work_days`.
4. Attendance/commission flags are persisted for future logic but not yet applied to payout computation.

## User Flow

1. Manager opens payroll settings screen.
2. Frontend loads current settings with `GET /api/v1/payroll`.
3. If no config exists (`payroll: null`), show setup form.
4. Manager submits create form using `POST /api/v1/payroll`.
5. Manager edits existing settings using `PUT /api/v1/payroll/{id}`.
6. Agent-facing views can read and display payroll settings but cannot mutate them.

## API Endpoints

1. `GET /api/v1/payroll`
2. `POST /api/v1/payroll`
3. `PUT /api/v1/payroll/{id}`

Auth headers:

1. `Authorization: Bearer <token>`
2. `Accept: application/json`

## Frontend Rules

1. Always send `company_id` when user can switch companies.
2. Treat `daily_pay` as backend-derived (read-only in UI).
3. Keep `salary_type`, `base_salary`, `work_days`, and `work_hours` in a single form state object.
4. Show toggles for `attendance_affects_pay` and `commission_enabled`, but label them as future-ready if business logic is not yet active.
5. Hide Save/Create actions for agent users.

## Request Examples

### Create Payroll Settings

```json
{
  "company_id": 1,
  "salary_type": "monthly",
  "base_salary": 120000,
  "work_days": 22,
  "work_hours": 8,
  "attendance_affects_pay": false,
  "commission_enabled": false
}
```

### Update Payroll Settings

```json
{
  "company_id": 1,
  "salary_type": "weekly",
  "base_salary": 90000,
  "currency": "NGN",
  "work_days": 18,
  "work_hours": 10,
  "attendance_affects_pay": true,
  "commission_enabled": true
}
```

## Response Example

```json
{
  "success": true,
  "message": "Payroll settings fetched successfully.",
  "data": {
    "payroll": {
      "id": 10,
      "company_id": 1,
      "salary_type": "monthly",
      "base_salary": 120000,
      "currency": "NGN",
      "work_days": 22,
      "work_hours": 8,
      "daily_pay": 5454.55,
      "attendance_affects_pay": false,
      "commission_enabled": false,
      "created_at": "2026-04-27T12:00:00+00:00",
      "updated_at": "2026-04-27T12:00:00+00:00"
    }
  },
  "errors": null
}
```

## Validation and UX Guardrails

1. `salary_type` required (`monthly` or `weekly`).
2. `base_salary` must be greater than 0.
3. `work_days` must be greater than 0.
4. `work_hours` allowed range is 4 to 12.
5. `currency` must be 3 letters if provided.

Recommended client behavior:

1. Keep lightweight client-side validation for fast feedback.
2. Always render backend validation messages from `errors` object.
3. Disable submit while request is in flight.

## Error Handling

1. `401`: redirect to login/session refresh.
2. `422`: show field-level validation errors and authorization messages.
3. `429`: show retry guidance for throttled save requests.

## Frontend Integration Example (fetch)

```javascript
const API = '/api/v1';

function authHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function getPayroll(companyId) {
  const response = await fetch(`${API}/payroll?company_id=${companyId}`, {
    headers: authHeaders(),
  });
  return response.json();
}

export async function createPayroll(payload) {
  const response = await fetch(`${API}/payroll`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function updatePayroll(id, payload) {
  const response = await fetch(`${API}/payroll/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}
```
