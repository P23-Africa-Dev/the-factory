# CRM Management Frontend Guide

## Endpoint Map

1. `GET /api/v1/admin/crm/leads`
2. `POST /api/v1/admin/crm/leads`
3. `GET /api/v1/admin/crm/leads/{lead}`
4. `PATCH /api/v1/admin/crm/leads/{lead}`
5. `POST /api/v1/admin/crm/leads/{lead}/notes`
6. `POST /api/v1/admin/crm/leads/{lead}/activities`
7. `GET /api/v1/admin/crm/leads/pipeline`

Agent aliases are available under `/api/v1/agent/crm/*`.

## Integration Tips

1. Send explicit `company_id` in list and write calls.
2. Load leads and pipeline summaries in parallel for board screens.
3. Surface backend `422` errors directly for validation feedback.
