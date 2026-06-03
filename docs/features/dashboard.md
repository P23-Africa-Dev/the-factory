# Dashboard

## Scope

Dashboard overview now returns live activity metrics and live ongoing task progress for both management and agent roles without changing the existing UI structure.

## Endpoint

- GET /api/v1/admin/dashboard/overview
- GET /api/v1/agent/dashboard/overview

Both endpoints use company context validation and role-based scoping.

## Activity Metric

The backend computes a weekly activity score from current week versus previous week.

Response shape:

```json
{
  "activity_metric": {
    "activity_score": 50,
    "direction": "up",
    "current_week": 60,
    "previous_week": 40,
    "current_week_daily": [
      { "name": "Mon", "value": 8 },
      { "name": "Tue", "value": 7 }
    ]
  }
}
```

Formula:

- If previous week > 0:
  - activity_score = ((current_week - previous_week) / previous_week) * 100
- If previous week = 0 and current week > 0:
  - activity_score = 100
- If both are 0:
  - activity_score = 0

Direction rules:

- up: score > 0
- down: score < 0
- flat: score = 0

## Activity Sources Included

The score aggregates meaningful activity signals including:

- tasks created
- tasks started
- tasks completed
- task reassignment requests/responses
- attendance clock-in and clock-out
- leads created
- lead notes and lead activities
- payroll settings create/update (management scope)
- tracking sessions started
- tracking location updates
- task proofs submitted
- notifications read/interacted
- projects created
- company membership additions (management scope)

Role behavior:

- Management: company-wide activity
- Agent: self activity only

## Ongoing Tasks

Dashboard overview now includes active task-tracking payload:

```json
{
  "ongoing_tasks": [
    {
      "task_id": 12,
      "task_title": "Cover Ikeja market",
      "status": "ACTIVE",
      "tracking_state": "in_progress",
      "progress_percent": 42,
      "total_distance_meters": 20123.4,
      "covered_distance_meters": 8451.2,
      "remaining_distance_meters": 11672.2,
      "eta_minutes": null,
      "agent": {
        "id": 33,
        "name": "Alex Doe",
        "avatar_url": "/avatars/male-avatar.png",
        "initials": "AD"
      }
    }
  ]
}
```

Progress model:

- total_distance_meters: start to destination
- covered_distance_meters: start to latest live location
- progress_percent = covered / total * 100 (clamped to 0..100)
- arrival_detected_at forces 100% and ARRIVED state

Only in-progress tasks with active tracking sessions are returned.

Role behavior:

- Management: organization active tasks
- Agent: assigned active tasks only

## Existing Dashboard Fields

Existing KPI, project KPI, calendar task feed, and CRM snapshot fields remain unchanged and continue to be returned in the same envelope.
