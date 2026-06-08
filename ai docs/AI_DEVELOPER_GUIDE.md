# Factory23 AI Developer Guide

## 1. Technical Stack Context
Backend:
- Laravel
- MySQL
- Redis
- Queue jobs and scheduler

Frontend:
- Next.js
- TypeScript
- React hooks/components for chat orchestration

## 2. Core Backend Components
- `CopilotController`: API chat/threads and SSE behavior.
- `CopilotService`: orchestration core.
- `IntentClassifier`: pattern-based intent routing.
- `ToolPolicyService`: role-tool allowlist.
- `ActionConfirmationPolicyService`: confirmation-gated tools.
- `ReadToolRegistry`: secure read operations.
- `ActionToolRegistry`: validated write operations.
- `ConversationMemoryService`: Redis thread memory.
- `AiProviderRouter` + providers: OpenAI/Claude routing.
- `AiLoggingService`: request lifecycle logging and analytics.

## 3. Request Processing Internals
1. Resolve context using `CompanyContextService`.
2. Check monthly credit guard.
3. Begin AI log entry.
4. Classify intent (`general`/`tool`/`action`).
5. Apply role policy + optional action toggle.
6. Run provider text generation or tool/action registry.
7. Apply PII redaction (if enabled).
8. Persist conversation memory.
9. Complete log and return response.

## 4. Provider Integration Details
OpenAI:
- `POST /chat/completions`
- `POST /audio/transcriptions`

Claude:
- `POST /messages`
- Audio transcription currently returns null (text-only role in current implementation)

Router behavior:
- Ordered by `AI_PROVIDER`, then `AI_FALLBACK_PROVIDER`.
- Uses first provider that is configured and returns non-empty result.

## 5. Tool Extension Pattern
To add a new read tool:
1. Add classifier pattern.
2. Add role policy mapping.
3. Implement in `ReadToolRegistry` with scoped queries.
4. Add tests for role and tenant isolation.

To add a new action tool:
1. Add classifier action pattern.
2. Add allowlist policy.
3. Add confirmation requirement.
4. Implement strict validation in `ActionToolRegistry`.
5. Add action + policy tests.

## 6. Automation Framework
Flow:
- `POST /copilot/automations/preview`: parse/validate rule JSON.
- `POST /copilot/automations`: persist rule.
- Optional `run_now` dispatches `ExecuteAutomationRuleJob`.

Runtime safeguards:
- Company ownership check.
- Active status check.
- Membership and role revalidation at execution time.

## 7. Reporting Framework
Weekly report lifecycle:
- Queue request -> status cache (`queued`).
- Job marks `running` and publishes realtime progress.
- Build summary from analytics services.
- Mark `completed` or `failed`.
- Download endpoint streams JSON only when completed.

## 8. Frontend Integration
Key files:
- API client supports chat, SSE, reports, automations, phase-5 endpoints.
- Hook manages thread state, streaming deltas, confirmation re-submission, report polling.
- AI chat component exposes quick actions and confirmation UI.

## 9. Security-by-Design Rules for Contributors
- Never bypass `CompanyContextService` for AI request paths.
- Always apply role policy checks before tool execution.
- Keep write actions behind validation and confirmation.
- Keep secrets server-side only; never expose AI keys to frontend.
- Preserve logability: include intent/tool context in outcomes.

## 10. Testing Guidance
Existing test families include:
- Read flow, tenant isolation, role access.
- Action engine and confirmation logic.
- Reporting and automation workflows.
- Phase-5 innovation endpoints.
- Frontend hook/component behavior.

When extending AI:
- Add feature tests for permission denied and cross-tenant denial.
- Add regression test for idempotency behavior on actions.
- Add integration tests for provider fallback paths when possible.

## 11. Known Implementation Boundaries
- Intent classification is keyword-based (not semantic classifier).
- Provider retries are not separately implemented beyond provider sequence failover.
- Conversation memory is cache-based with TTL, not permanent transcript storage.
- Some phase-5 capabilities are scaffolded with partial intelligence depth.

## 12. Implemented Tool Catalog (Detailed)

### CRM Tools
Implemented now:
- `crm.top_leads`
	- Purpose: Return top CRM leads in active scope.
	- Inputs: optional `limit`.
	- Outputs: lead list, counts, summary.
	- Security: company scoped via lead service + resolved context.
	- Audit: intent/tool logged in `ai_logs`.

Not yet implemented as tool routes:
- Lead assignment action tool.
- Dedicated pipeline analysis tool route (pipeline insights currently inferred through top leads and dashboard patterns, not a standalone action/read tool id).

### Project Tools
Implemented now:
- `projects.at_risk_summary`
	- Inputs: optional `limit`.
	- Outputs: project risk list with overdue/completion metrics.
	- Security: company scope + agent-specific project filtering when role=agent.
	- Audit: logged with tool name and status.

- `projects.create`
	- Inputs: name, start_date, optional metadata/status/priority/team.
	- Outputs: created project id/name/status.
	- Security: role policy + validation.
	- Audit: action call logged; confirmation policy enforced before execution.

### Task Tools
Implemented now:
- `tasks.overdue`
	- Inputs: optional `limit`.
	- Outputs: overdue task list and counts.
	- Security: company scope; agent sees assigned tasks only.
	- Audit: read usage logged.

- `tasks.create`
	- Inputs: title, type, description, location, address, due_date, optional assignment/project/geo/priority.
	- Outputs: task_id/title/status.
	- Security: role policy + payload validation + company scope.
	- Audit: action logged; confirmation required.

- `tasks.reassign`
	- Inputs: task_id, to_user_id, optional reason.
	- Outputs: reassignment record details.
	- Security: role policy + validation + reassignment service checks.
	- Audit: action logged; confirmation required.

### Attendance Tools
Implemented now:
- `attendance.today_summary`
	- Inputs: none.
	- Outputs: role-specific attendance metrics.
	- Security: management vs agent-specific response path.
	- Audit: read usage logged.

### Payroll Tools
Implemented now:
- No standalone payroll read/action tool id in `IntentClassifier`/tool registries.
- Payroll is included in executive analytics context and forecast/report outputs.

### Meeting Tools
Implemented now:
- `meetings.today`
	- Inputs: optional `limit`.
	- Outputs: meetings scheduled today.
	- Security: meeting service enforces user/company scope.
	- Audit: read usage logged.

- `meetings.schedule`
	- Inputs: title/timezone/start/end + optional attendees/reminders/project/task/location.
	- Outputs: meeting id/timing/integration metadata.
	- Security: role policy + validation + company scope.
	- Audit: action logged; confirmation required.

### Tracking Tools
Implemented now:
- `tracking.active_agents`
	- Inputs: optional `limit`.
	- Outputs: live active agent snapshot.
	- Security: management-only policy.
	- Audit: read usage logged.

### Notification Tools
Implemented now:
- `notifications.send`
	- Inputs: title/message + user_ids or roles.
	- Outputs: delivered notification count.
	- Security: validates recipients belong to active company.
	- Audit: action logged; confirmation required.

### Dashboard Tools
Implemented now:
- `dashboard.overview`
	- Inputs: none.
	- Outputs: KPI/activity/project overview payload.
	- Security: scoped overview via aggregate service.
	- Audit: read usage logged.
