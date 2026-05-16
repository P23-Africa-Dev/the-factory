# CRM Management Frontend Guide

## Goal

Integrate lead pipeline screens, lead details, and interaction logging from the CRM API surface.

## Endpoint Map

1. Management routes:
   - `GET /api/v1/admin/crm/leads`
   - `POST /api/v1/admin/crm/leads`
   - `GET /api/v1/admin/crm/leads/{lead}`
   - `PATCH /api/v1/admin/crm/leads/{lead}`
   - `POST /api/v1/admin/crm/leads/{lead}/notes`
   - `POST /api/v1/admin/crm/leads/{lead}/activities`
   - `GET /api/v1/admin/crm/leads/pipeline`
2. Agent routes (role-limited aliases):
   - `GET /api/v1/agent/crm/leads`
   - `GET /api/v1/agent/crm/leads/{lead}`
   - `POST /api/v1/agent/crm/leads/{lead}/notes`
   - `POST /api/v1/agent/crm/leads/{lead}/activities`
   - `GET /api/v1/agent/crm/leads/pipeline`

## Integration Pattern

1. Always send `company_id` in query/body to avoid ambiguous context.
2. Load list + pipeline summary in parallel for board views.
3. Optimistically append note/activity rows, then reconcile with server response.
4. Use lead IDs for detail caching keys.

## Error UX

1. `422` should display backend validation errors directly.
2. If company context mismatch occurs, prompt user to reselect active company.
3. Handle throttling (`429`) with retry/backoff for rapid note/activity submissions.
