# Dashboard Overview API

## Overview

Role-aware aggregate endpoint for dashboard cards, feed items, and summary slices.

## Endpoints

1. `GET /api/v1/admin/dashboard/overview`
2. `GET /api/v1/agent/dashboard/overview`

## Query Parameters

1. `company_id` (required for deterministic context in frontend integrations)
2. `from` (optional ISO date)
3. `to` (optional ISO date)
4. `timezone` (optional IANA timezone)

## Operational Notes

1. Uses company-scoped aggregate caching.
2. Task and lead writes invalidate cache via version bump observers.
3. Response is envelope-based (`success`, `message`, `data`, `errors`).
