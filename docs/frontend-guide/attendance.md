# Attendance Frontend Integration Guide

## Purpose
This guide describes how frontend clients should consume the new attendance backend APIs. No frontend code changes were applied by this implementation.

## Auth + Company Context
- All attendance endpoints require authenticated API access.
- Pass `company_id` (numeric id or public company id string) where relevant.
- Role gates are enforced server-side.

## Agent Integration

### 1) Load current status card
- `GET /api/v1/attendance/today`
- Use response fields:
  - `working_day`
  - `window_active`
  - `can_clock_in`
  - `can_clock_out`
  - `record`
  - `status`

### 2) Clock-in action
- `POST /api/v1/attendance/clock-in`
- On success, refresh `GET /attendance/today` and history list.

### 3) Clock-out action
- `POST /api/v1/attendance/clock-out`
- On success, refresh `GET /attendance/today` and history list.

### 4) Attendance history
- `GET /api/v1/attendance/history`
- Query params:
  - `company_id`
  - `from_date`
  - `to_date`
  - `status`
  - `per_page`

### 5) Attendance stats
- `GET /api/v1/attendance/stats`
- Query params:
  - `company_id`
  - `year`
  - `month`

### 6) Monthly attendance payroll summary
- `GET /api/v1/attendance/payroll-summary`
- Query params:
  - `company_id`
  - `year`
  - `month`

## Management Integration

### Attendance settings
- `GET /api/v1/attendance/settings`
- `PUT /api/v1/attendance/settings`

### Daily workforce metrics
- `GET /api/v1/attendance/metrics`
- Query params:
  - `company_id`
  - `date`

### Daily attendance list
- `GET /api/v1/attendance/records`
- Query params:
  - `company_id`
  - `date`
  - `status` (`present`, `late`, `auto_clocked_out`, `clocked_out`, `absent`)
  - `role` (`agent`, `supervisor`)
  - `search`
  - `per_page`
  - `page`

Response notes:

- `items[*].avatar_url` is now a fully resolved URL and should be used directly by UI image tags.
- `pagination` includes `current_page`, `last_page`, and `total` for page-number controls.
- `status=present` includes records with `present`, `late`, and `auto_clocked_out` backend statuses.
- `status=clocked_out` returns records where check-out exists (including `auto_clocked_out`).

### Monthly attendance payroll summaries
- `GET /api/v1/attendance/payroll-summaries`
- Query params:
  - `company_id`
  - `year`
  - `month`
  - `per_page`

- `POST /api/v1/attendance/payroll-summaries/generate`

## Error Cases to Handle
- `422` when:
  - attendance settings are missing
  - clock-in is outside allowed window
  - duplicate clock-in/clock-out occurs
  - invalid date/month/company context is supplied
- `403` when role is not permitted for the endpoint
- `401` when unauthenticated

## UI Behavior Recommendations
- Disable action buttons using `can_clock_in` / `can_clock_out`.
- Show explicit reason messages from `message`/`errors` on 422 responses.
- Refresh daily metrics/list after management changes or payroll generation.
- Keep pagination controls wired to `next_page_url` and `prev_page_url`.
