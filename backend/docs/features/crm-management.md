# CRM Management API

## Overview

The CRM module exposes company-scoped lead management for owners/admins/supervisors and read/write collaboration for agents where explicitly allowed.

## Endpoints

1. `GET /api/v1/admin/crm/leads`
2. `POST /api/v1/admin/crm/leads`
3. `GET /api/v1/admin/crm/leads/{lead}`
4. `PATCH /api/v1/admin/crm/leads/{lead}`
5. `POST /api/v1/admin/crm/leads/{lead}/notes`
6. `POST /api/v1/admin/crm/leads/{lead}/activities`
7. `GET /api/v1/admin/crm/leads/pipeline`
8. Agent-compatible aliases are available under `/api/v1/agent/crm/*` for read/pipeline/note/activity workflows.

## Auth And Context

1. Requires `Authorization: Bearer <token>`.
2. Requests are scoped by company membership.
3. `company_id` supports internal numeric ID and public company ID string (for example `FAC-ABCD1234`).

## Request Notes

1. Create/update validates stage/status and lead ownership constraints.
2. Notes and activities are write-audited with actor and timestamps.
3. Pipeline endpoint accepts optional date/stage filters.

## Response Notes

1. All responses use the standard envelope: `success`, `message`, `data`, `errors`.
2. Lead resources include render-ready stage/status metadata and related assignee details.
3. Pipeline response includes aggregated counts and value slices by stage.

## Status Codes

1. `200` for successful reads/updates.
2. `201` for lead, note, and activity creation.
3. `401` for unauthenticated requests.
4. `422` for validation, authorization, or company-scope failures.
