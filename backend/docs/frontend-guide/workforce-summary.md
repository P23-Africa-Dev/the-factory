# Workforce Summary Frontend Guide

## Goal

Drive workforce widgets (attendance, workload, distribution) from a single company-scoped endpoint.

## Endpoints

1. `GET /api/v1/admin/workforce/summary`
2. `GET /api/v1/agent/workforce/summary`

## Integration Pattern

1. Query with explicit `company_id`.
2. Pair this endpoint with `/api/v1/agents/locations` for map-marker detail.
3. Refresh summary after assignment changes or tracking lifecycle transitions.

## UI Mapping Suggestions

1. `agent_summary` -> header counters.
2. `task_distribution` -> donut/stack chart blocks.
3. `attendance_proxy` -> daily attendance card.
4. `top_workload` -> ranked list with avatar/name chips.

## Error And Fallback

1. On `422`, preserve prior summary in UI and show contextual warning.
2. If realtime channel is unavailable, increase polling cadence temporarily (10-15s).
3. If no data exists yet, render zero-state cards rather than error screens.
