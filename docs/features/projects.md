# Projects

## Scope

Projects All Projects now exposes backend analytics for:

- project performance score
- timeline consumption
- task completion
- agents who have not commenced tasks
- not-commenced trend (week-over-week)

This is company-context aware and role-scoped.

## Endpoints

- GET /api/v1/admin/projects
- GET /api/v1/agent/projects

Both list endpoints now return an `analytics` object in addition to paginated `items`.

## Analytics Payload

```json
{
  "analytics": {
    "project_performance": {
      "project_progress": 68,
      "task_completion": 72,
      "timeline_consumption": 60,
      "status": "GOOD"
    },
    "non_commenced_agents": {
      "assigned_agents": 10,
      "not_started": 3,
      "percentage": 30,
      "previous_week_not_started": 5,
      "current_week_not_started": 3,
      "trend_direction": "improved"
    }
  }
}
```

## Timeline Consumption Formula

Timeline uses `project.start_date` and `project.end_date` across scoped projects.

Per project:

- duration_days = `max(1, diffInDays(start_date, end_date))`
- elapsed_days = `min(duration_days, diffInDays(start_date, today))` clamped at `>= 0`

Aggregate:

- timeline_consumption = `(sum(elapsed_days) / sum(duration_days)) * 100`

Notes:

- Projects without both dates are excluded from timeline ratio.
- Date difference follows the product convention (e.g., Aug 1 to Aug 31 = 30 days).

## Task Completion Formula

Scoped task set is project-linked tasks in the same company and role scope.

- total_tasks = count(tasks)
- completed_tasks = count(tasks where status = completed)
- task_completion = `(completed_tasks / total_tasks) * 100`

## Project Performance Formula

Performance combines completion and schedule alignment.

1. pace_gap = `max(0, timeline_consumption - task_completion)`
2. pace_score = `clamp(100 - (pace_gap * 2), 0, 100)`
3. project_progress = `(task_completion * 0.7) + (pace_score * 0.3)`

Status bands:

- 0-25 => POOR
- 26-50 => FAIR
- 51-75 => GOOD
- 76-100 => EXCELLENT

This penalizes being behind schedule and rewards on-time or ahead-of-time execution.

## Non-Commenced Agents Logic

Definition of not commenced:

- task is assigned (`assigned_agent_id` present)
- task status is `pending`
- `started_at` is null

Metrics:

- assigned_agents = distinct assigned agents with project-linked tasks in scope
- not_started = distinct assigned agents with at least one not-commenced task
- percentage = `(not_started / assigned_agents) * 100`

Trend windows:

- previous_week_not_started: previous week distinct count
- current_week_not_started: current week distinct count
- trend_direction:
  - improved when current < previous
  - worsened when current > previous
  - flat when equal

## Role Scope

Management (owner/admin/supervisor):

- organization projects
- organization project tasks
- organization non-commenced agents

Agent:

- only projects where the agent has assigned/current/historical ownership visibility
- only tasks visible through agent assignment scope
- own scoped analytics only

## Membership and Isolation

All analytics are computed inside active company context and honor role restrictions, preventing cross-company leakage.
