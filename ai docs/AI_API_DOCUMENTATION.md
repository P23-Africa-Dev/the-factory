# Factory23 AI API Documentation

## Base Path
- API: `/api/v1`
- Copilot prefix: `/api/v1/copilot`

Authentication:
- Bearer token required.
- Active company membership required for tenant-scoped endpoints.

## 1. Chat and Threads

### POST `/copilot/chat`
Purpose:
- Main AI entry point for general, read, and action workflows.

Request:
```json
{
  "message": "Show overdue tasks",
  "company_id": 12,
  "thread_id": "optional-thread-id",
  "stream": true,
  "action_args": {},
  "action_confirmed": false,
  "idempotency_key": "optional-idempotency-key"
}
```

Response:
- JSON envelope when non-stream mode.
- SSE (`meta`, `delta`, `done`) when stream mode and enabled.

### GET `/copilot/threads`
Purpose:
- List thread summaries for current user and company scope.

### GET `/copilot/threads/{thread}`
Purpose:
- Get a full thread with messages.

### DELETE `/copilot/threads/{thread}`
Purpose:
- Delete a thread in user/company scope.

## 2. Reporting Endpoints

### GET `/copilot/analytics/context-pack`
Purpose:
- Generate executive analytics context from existing services.

### POST `/copilot/reports/weekly-summary`
Purpose:
- Queue weekly report generation.

Response (202):
```json
{
  "report_id": "uuid",
  "company_id": 12
}
```

### GET `/copilot/reports/weekly-summary/{reportId}`
Purpose:
- Fetch report status (`queued|running|completed|failed`) and progress.

### GET `/copilot/reports/weekly-summary/{reportId}/download`
Purpose:
- Download report JSON when completed.

## 3. Automation Endpoints

### POST `/copilot/automations/preview`
Purpose:
- Translate prompt to structured rule (no persistence).

Request:
```json
{
  "company_id": 12,
  "prompt": "Create task every week for safety checklist"
}
```

### POST `/copilot/automations`
Purpose:
- Persist automation rule.

Request:
```json
{
  "company_id": 12,
  "name": "Weekly Safety Checklist",
  "prompt": "Create task every week for safety checklist",
  "run_now": false
}
```

### GET `/copilot/automations`
Purpose:
- List automation rules for scope.

### POST `/copilot/automations/{automation}/run`
Purpose:
- Queue immediate automation execution.

## 4. Innovation (Phase 5) Endpoints

### POST `/copilot/voice/transcriptions`
Purpose:
- Upload audio and return transcription payload.

Validation:
- `audio` required, mimes `mp3,wav,m4a,ogg,webm`, max 20MB.

### POST `/copilot/files/analyze`
Purpose:
- Upload file and return analysis payload.

Validation:
- `file` required, mimes `pdf,xlsx,xls,csv`, max 30MB.

### POST `/copilot/meetings/transcripts/summarize`
Purpose:
- Summarize transcript into key points/action items.

Validation:
- `transcript` required, min 20 chars, max 50000.
- Optional `meeting_id` must exist and belong to active company context.

### GET `/copilot/forecast/overview`
Purpose:
- Return KPI/payroll-based recommendations.

## 5. Tool Contract Summary

Read tools currently routed:
- `crm.top_leads`
- `tasks.overdue`
- `projects.at_risk_summary`
- `attendance.today_summary`
- `meetings.today`
- `tracking.active_agents`
- `dashboard.overview`

Action tools currently routed:
- `tasks.create`
- `tasks.reassign`
- `meetings.schedule`
- `notifications.send`
- `projects.create`

## 6. Action Confirmation Contract
When a tool requires confirmation and request is unconfirmed:
- Response payload includes:
```json
{
  "confirmation_required": true,
  "tool": "tasks.create",
  "action_args": {}
}
```

Client should resend with:
- `action_confirmed=true`
- same `action_args`
- recommended `idempotency_key`

## 7. Common Error Semantics
- 401: authentication/authorization failure.
- 404: scoped resource not found.
- 409: report download requested before completion.
- 422: validation or company context mismatch.
- 429: throttling.

## 8. Realtime Event
Event used in weekly report progress:
- `copilot.reports.weekly.progress`

Payload:
```json
{
  "report_id": "uuid",
  "status": "running",
  "progress": 35,
  "error": null
}
```
