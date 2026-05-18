# Workforce Summary Frontend Guide

## Endpoints

1. `GET /api/v1/admin/workforce/summary`
2. `GET /api/v1/agent/workforce/summary`

## Recommended Usage

1. Always pass `company_id`.
2. Combine with `/api/v1/agents/locations` for live marker states.
3. Re-fetch after reassignment and tracking transitions.
4. Render empty-state cards when payload sections are empty.
