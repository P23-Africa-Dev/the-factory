# Payroll Management API

## Overview

This feature provides company-level payroll configuration with strict tenant isolation.

Design goals:

1. Owners, admins, and supervisors define a single payroll policy per company.
2. Agents inherit the company payroll policy through company membership.
3. Daily pay is automatically derived from base salary and work days.
4. Attendance and commission toggles are persisted for future payroll extensions.

## Endpoints

Authenticated via `auth:sanctum`:

1. `POST /api/v1/payroll`
2. `GET /api/v1/payroll`
3. `PUT /api/v1/payroll/{id}`

## Authentication

All endpoints require Sanctum bearer token.

Headers:

1. `Accept: application/json`
2. `Authorization: Bearer <token>`

## Authorization Rules

Role permissions in company context:

1. `owner|admin|supervisor`
   - Can create payroll settings
   - Can update payroll settings
   - Can fetch payroll settings
2. `agent`
   - Can fetch payroll settings (inherited view)
   - Cannot create or update payroll settings
3. Unknown non-manager roles
  - Read access is denied
  - Write access is denied

## Data Model

### payroll_settings

1. `id`
2. `company_id` unique foreign key to companies
3. `salary_type` enum: `monthly|weekly`
4. `base_salary` decimal(14,2)
5. `currency` char(3)
6. `work_days` unsigned small integer (default: 22)
7. `work_hours` unsigned tiny integer (default: 8)
8. `daily_pay` decimal(14,2) auto-calculated
9. `attendance_affects_pay` boolean (default: false)
10. `commission_enabled` boolean (default: false)
11. `created_at`
12. `updated_at`

Constraints:

1. One payroll configuration per company (`unique(company_id)`).
2. Company foreign key uses cascade delete.
3. Update operations enforce that route payroll setting belongs to resolved company context.

## Calculation Logic

Daily pay is recalculated whenever payroll settings are created or updated.

Formula:

1. `daily_pay = round(base_salary / work_days, 2)`

Example:

1. `base_salary = 120000`
2. `work_days = 22`
3. `daily_pay = 5454.55`

## Request and Response Contracts

### 1) Create Payroll Settings

`POST /api/v1/payroll`

Request:

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

Success 201:

```json
{
  "success": true,
  "message": "Payroll settings created successfully.",
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

### 2) Fetch Payroll Settings

`GET /api/v1/payroll?company_id=1`

Success 200 (configured):

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
      "commission_enabled": false
    }
  },
  "errors": null
}
```

Success 200 (not configured):

```json
{
  "success": true,
  "message": "Payroll settings fetched successfully.",
  "data": {
    "payroll": null
  },
  "errors": null
}
```

### 3) Update Payroll Settings

`PUT /api/v1/payroll/{id}`

Request:

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

Success 200:

```json
{
  "success": true,
  "message": "Payroll settings updated successfully.",
  "data": {
    "payroll": {
      "id": 10,
      "company_id": 1,
      "salary_type": "weekly",
      "base_salary": 90000,
      "currency": "NGN",
      "work_days": 18,
      "work_hours": 10,
      "daily_pay": 5000,
      "attendance_affects_pay": true,
      "commission_enabled": true
    }
  },
  "errors": null
}
```

## Validation Rules

Create and update payload rules:

1. `salary_type` required, enum `monthly|weekly`
2. `base_salary` required, numeric, greater than 0
3. `work_days` required, integer, greater than 0
4. `work_hours` required, integer, between 4 and 12
5. `currency` optional, 3-letter uppercase code; if omitted, company currency is used
6. `attendance_affects_pay` optional boolean
7. `commission_enabled` optional boolean
8. `company_id` optional; if omitted, latest active company context is used

## Multi-Tenant Guarantees

1. Company context is resolved from active `company_users` membership.
2. Cross-company fetch attempts are rejected.
3. Cross-company update attempts are rejected even when the payroll ID exists.
4. All responses and writes are scoped to the resolved company context.

## Status Codes

1. `200` Success
2. `201` Created
3. `401` Unauthenticated
4. `422` Validation or authorization failure
5. `429` Rate limit exceeded

## Edge Cases

1. Duplicate payroll creation for same company is rejected.
2. If no payroll config exists yet, `GET /payroll` returns `payroll: null`.
3. Agent write attempts return authorization validation errors.
4. `daily_pay` always recalculates from `base_salary` and `work_days`.

## Test Coverage

Feature test file:

1. `src/tests/Feature/Payroll/PayrollManagementTest.php`

Covered scenarios:

1. Admin create flow
2. Supervisor update flow
3. Daily pay auto-calculation and recalculation
4. Agent inheritance (read-only fetch)
5. Role-based write restrictions
6. Company isolation for fetch and update
7. Duplicate configuration prevention
8. Positive value validation
