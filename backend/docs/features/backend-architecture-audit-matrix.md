# Backend Architecture Audit Matrix

Date: 2026-05-16
Scope: API-first backend architecture and implementation coverage for auth, projects, tasks, tracking, payroll, internal users, CRM, dashboard aggregates, and workforce summaries.

## Coverage Matrix

| Module               | Routes  | Services | Tests   | Docs    | Status | Notes                                                                  |
| -------------------- | ------- | -------- | ------- | ------- | ------ | ---------------------------------------------------------------------- |
| Authentication       | Present | Present  | Present | Present | Stable | Role-aware auth is implemented with comprehensive tests.               |
| Projects             | Present | Present  | Present | Present | Stable | Pagination and manager scoping patterns established.                   |
| Tasks                | Present | Present  | Present | Present | Stable | Lifecycle and assignment flow implemented.                             |
| Task Tracking        | Present | Present  | Present | Present | Stable | Dual-contract map flow complete: lifecycle writes + snapshot reads.    |
| Payroll              | Present | Present  | Present | Present | Stable | Request normalization hardened; partial update behavior covered.       |
| Internal Users       | Present | Present  | Present | Present | Stable | Fetch/onboarding/supervisor flows and negative-path filters covered.   |
| CRM                  | Present | Present  | Present | Present | Stable | Leads, notes, activities, and pipeline docs/contracts aligned.         |
| Dashboard Aggregates | Present | Present  | Present | Present | Stable | Overview endpoint documented with cache invalidation behavior.         |
| Workforce Summaries  | Present | Present  | Present | Present | Stable | Summary endpoint documented and integrated with map snapshot strategy. |

## Canonical Patterns Frozen

- Company context resolution: CompanyContextService::resolve
- Role gating: access.role middleware groups and contextual role checks
- Pagination/search: simplePaginate or paginate with withQueryString
- API envelope: success, message, data, errors
- Multi-surface route parity: canonical and role-prefixed aliases for compatibility

## Map Contract Decision (Recorded)

- Keep task-centric tracking lifecycle endpoints as canonical for execution writes.
- Add agent-location snapshot/list read APIs in map phase for dashboard and map consumers.
- Maintain compatibility with existing realtime route and channel patterns.

## Current Gaps To Close Next

1. Consolidate duplicated compatibility aliases in `routes/api.php` behind a deprecation schedule.
2. Execute full runtime test suite once DB host DNS (`mysql`) is reachable in this environment.
3. Track alias usage telemetry before removing legacy route mirrors.
