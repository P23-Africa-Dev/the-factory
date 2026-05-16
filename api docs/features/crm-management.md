# CRM Management API

## Overview

The CRM module exposes company-scoped lead management for owners/admins/supervisors and role-limited collaboration paths for agents.

## Endpoints

1. `GET /api/v1/admin/crm/leads`
2. `POST /api/v1/admin/crm/leads`
3. `GET /api/v1/admin/crm/leads/{lead}`
4. `PATCH /api/v1/admin/crm/leads/{lead}`
5. `POST /api/v1/admin/crm/leads/{lead}/notes`
6. `POST /api/v1/admin/crm/leads/{lead}/activities`
7. `GET /api/v1/admin/crm/leads/pipeline`

Agent aliases are available under `/api/v1/agent/crm/*` for list/show/pipeline/note/activity.

## Context

1. Requires Bearer token auth.
2. Company scope is enforced by membership and role checks.
3. `company_id` supports internal numeric ID or public company ID string.

## Status Codes

1. `200` read/update success.
2. `201` creation success.
3. `401` unauthenticated.
4. `422` validation or authorization failure.
