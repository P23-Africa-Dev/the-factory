# Payroll

## Purpose

Payroll is a company-scoped module that exposes payroll settings, payroll analytics, agent payroll profiles, and per-agent payroll overrides. It is designed to work together with attendance so payroll values reflect actual presence data when attendance-based pay is enabled.

## Roles And Access

- Owners, admins, and supervisors can manage payroll settings and edit agent payroll profiles.
- Agents can view only their own payroll profile and payroll data for their active company context.
- All endpoints require `auth:sanctum`.

## Endpoints

### Payroll Settings

- `GET /api/v1/payroll`
- `POST /api/v1/payroll`
- `PUT /api/v1/payroll/{payrollSetting}`

### Payroll Overview

- `GET /api/v1/payroll/overview`

Query params:
- `company_id`
- `date` optional, defaults to today

Response fields:
- `today_present_agents`
- `today_payroll_value`
- `payroll_rise`
- `payroll_fall`
- `total_commission`
- `pending_approval`
- `total_agents`
- `total_payroll`
- `currency`

### Payroll Agents

- `GET /api/v1/payroll/agents`
- `GET /api/v1/payroll/agents/{user}`
- `PATCH /api/v1/payroll/agents/{user}`

Query params:
- `company_id`
- `year`
- `month`
- `search`
- `status`
- `per_page`

### Payroll Export

- `GET /api/v1/payroll/export`

Query params:
- `company_id`
- `format` (`csv` or `xlsx`)
- `date` optional, defaults to today
- `year` optional
- `month` optional
- `search` optional
- `status` optional (`approved`, `pending`, `revoked`)
- `salary_type` optional (`daily`, `weekly`, `monthly`)
- `attendance_affects_pay` optional boolean
- `attendance_min` optional integer
- `attendance_max` optional integer

Export columns:
- `Employee Name`
- `Role`
- `Salary Type`
- `Currency`
- `Base Salary`
- `Daily Pay`
- `Attendance Count`
- `Accumulated Pay`
- `Attendance Affect Pay`
- `Payroll Status`
- `Created Date`
- `Project Count`
- `Completed Tasks`
- `Pending Tasks`

Notes:
- Exports are streamed and chunked for large datasets.
- Generated files follow `payroll-export-YYYY-MM-DD.<ext>` naming.

## Payroll Calculation Rules

- Base payroll settings are stored in `payroll_settings`.
- Per-agent overrides are stored on the `users` table.
- `attendance_affects_pay` determines whether the agent’s payable salary is derived from attendance presence or from the base salary directly.
- Per-agent `salary_type`, `base_salary`, and `salary_currency` overrides take priority over company defaults.
- `work_days_override` replaces the default work-day denominator when present.
- `daily_pay` is computed from the resolved salary type. Daily salaries use the configured daily amount directly.
- Attendance payroll summaries are generated from attendance records and the active payroll settings.

## Agent Payroll Profile Shape

The agent profile response includes:
- `id`
- `name`
- `email`
- `avatar_url`
- `assigned_zone`
- `role`
- `salary_type`
- `base_salary`
- `daily_pay`
- `work_days`
- `work_hours`
- `attendance_affects_pay`
- `commission_enabled`
- `currency`
- `attendance_days`
- `salary_payable`
- `history`

## Validation Notes

- `company_id` is always resolved through the company context helper.
- Payroll settings require positive salary and work-day values.
- Agent payroll updates require at least one editable field.
- Agents can only request their own payroll profile.
- Company boundaries are enforced on all payroll reads and writes.
- Export downloads require management roles (owner, admin, supervisor).
