# Dashboard Overview Frontend Guide

## Endpoints

1. `GET /api/v1/admin/dashboard/overview`
2. `GET /api/v1/agent/dashboard/overview`

## Recommended Usage

1. Include `company_id` on every request.
2. Use date filters only when the user selects custom ranges.
3. Refresh after task/lead writes that impact KPI cards.
4. Use polling fallback (30-60s) when realtime is not required.
