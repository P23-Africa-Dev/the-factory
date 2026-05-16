# Workforce Summary API

## Overview

Operational workforce aggregate for staffing, attendance proxy, and workload insights.

## Endpoints

1. `GET /api/v1/admin/workforce/summary`
2. `GET /api/v1/agent/workforce/summary`

## Query Parameters

1. `company_id`
2. `from` (optional)
3. `to` (optional)

## Notes

1. Pair with `/api/v1/agents/locations` for map marker details.
2. Payload is role-filtered and company-scoped.
3. Returns `422` on invalid scope or context resolution failures.
