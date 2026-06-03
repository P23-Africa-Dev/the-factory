# Dashboard Overview API

## Overview

Dashboard overview is an aggregate endpoint optimized for manager and agent dashboard widgets. It returns KPI summaries, short activity feeds, and role-filtered slices.

## Endpoints

1. `GET /api/v1/admin/dashboard/overview`
2. `GET /api/v1/agent/dashboard/overview`

## Query Parameters

1. `company_id` (int or public company ID)
2. `from` (optional ISO date)
3. `to` (optional ISO date)
4. `timezone` (optional IANA timezone)

## Data Contract

1. KPI cards: task completion, lead pipeline totals, payroll readiness indicators.
2. Work queues: self tasks (agent) or team distribution (management).
3. Feed: recent operational events with timestamps.
4. Includes `meta.generated_at` and cache context details.

## Caching

1. Uses company-scoped aggregate cache keys with version bumping.
2. Task and lead observers bump cache version on writes.
3. Cache misses recompute the aggregate service payload.

## Status Codes

1. `200` success.
2. `401` unauthenticated.
3. `422` validation or context/authorization failure.
