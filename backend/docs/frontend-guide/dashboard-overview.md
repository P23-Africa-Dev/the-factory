# Dashboard Overview Frontend Guide

## Goal

Render a unified dashboard payload for both management and agent experiences without multiple first-paint calls.

## Endpoints

1. `GET /api/v1/admin/dashboard/overview`
2. `GET /api/v1/agent/dashboard/overview`

## Query Strategy

1. Send `company_id` on every request.
2. Include date range (`from`, `to`) only when user selects a custom filter.
3. Keep timezone aligned with client display settings.

## Rendering Strategy

1. Read KPI cards from the top-level summary keys.
2. Use feed items for activity timeline widgets.
3. Render role-specific sections conditionally from payload shape.
4. Treat missing sections as empty states, not integration failures.

## Refresh Strategy

1. Poll every 30-60 seconds for management dashboards if websocket is not required.
2. Refresh immediately after task/lead writes that affect KPIs.
3. Keep stale-data badge using `meta.generated_at` if present.
