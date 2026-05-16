# Rollout Readiness Checklist

## Scope

CRM, Dashboard Overview, Workforce Summary, and Map Read Model (`agent_location_snapshots`).

## Migration And Deployment Order

1. Deploy backend code with backward-compatible routes first.
2. Run migrations including `create_agent_location_snapshots_table`.
3. Restart queue workers and realtime relay if deployment process does not auto-restart them.
4. Warm aggregate caches by hitting:
   - `GET /api/v1/admin/dashboard/overview`
   - `GET /api/v1/admin/workforce/summary`
   - `GET /api/v1/admin/crm/leads/pipeline`

## Backfill And Materialization

1. Map snapshots are updated on tracking lifecycle writes (`start`, `location`, `complete`).
2. No destructive backfill is required for rollout; empty snapshot tables are valid before first tracking write.
3. Optional post-deploy backfill can replay recent `task_location_points` if historical marker seeding is needed.

## Compatibility Notes

1. Canonical routes under `/api/v1/admin/*` and `/api/v1/agent/*` remain supported.
2. Legacy compatibility aliases are still present; do not remove until clients are confirmed migrated.
3. Prefer canonical role-prefixed routes for new frontend integrations.

## Observability Checklist

1. Monitor `422` error rates for context and authorization failures.
2. Track cache hit ratio for dashboard/workforce aggregates.
3. Track realtime relay connection counts and publish throughput.
4. Alert on snapshot staleness anomalies (`last_seen_at` lag spikes).
5. Verify task-tracking completion events produce both route and snapshot updates.

## Rollback Notes

1. If API regressions occur, route aliases allow temporary fallback without frontend redeploy.
2. If aggregate responses regress, clear aggregate cache versions and re-warm using management endpoints.
3. Keep migrations forward-only; prefer feature flags over schema rollback for live systems.
