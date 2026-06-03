# Workforce Summary API

## Overview

Workforce summary provides a compact operational snapshot for map, staffing, and supervisor planning screens.

## Endpoints

1. `GET /api/v1/admin/workforce/summary`
2. `GET /api/v1/agent/workforce/summary`

## Query Parameters

1. `company_id` (int or public company ID)
2. `from` (optional ISO date)
3. `to` (optional ISO date)

## Data Contract

1. Agent status summary (active, idle, offline/stale indicators).
2. Task distribution by status/priority.
3. Attendance proxy derived from location pings and tracking events.
4. Workload ranking slices for top assigned users.

## Operational Notes

1. Payload is company-scoped with role filtering.
2. Uses aggregate cache versioning for fast dashboard loads.
3. Best paired with `/api/v1/agents/locations` for live map markers.

## Status Codes

1. `200` success.
2. `401` unauthenticated.
3. `422` validation or context/authorization failure.
