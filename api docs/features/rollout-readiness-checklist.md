# Rollout Readiness Checklist

## Scope

CRM, Dashboard Overview, Workforce Summary, and Map Snapshot read model.

## Deploy Sequence

1. Deploy backend application code.
2. Run database migrations (including `agent_location_snapshots`).
3. Restart workers/realtime relay.
4. Warm aggregate cache endpoints.

## Observability

1. Watch `422` rates for context/authorization issues.
2. Track aggregate cache hit/miss behavior.
3. Track realtime relay connectivity and publish rates.
4. Monitor snapshot staleness (`last_seen_at`) distribution.

## Compatibility

1. Keep legacy route aliases active until client migration is complete.
2. Prefer canonical role-prefixed routes for all new integrations.
