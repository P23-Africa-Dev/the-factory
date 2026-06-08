# Factory23 AI Copilot Implementation Plan

## Objective
Build Ask The Factory as a native, organization-aware operational copilot for Factory23 with strict multi-tenant isolation, role-aware behavior, reusable service orchestration, auditability, and cost controls.

## Current State Audit Summary

### Existing frontend assets
- Floating AI widget already exists and should be preserved.
- Chat modal UI exists with typing indicators and message threading.
- Current chat behavior is dummy-response only.

### Existing backend architecture
- Domain services already exist for CRM, tasks, projects, attendance, payroll, meetings/calendar, notifications, dashboard, workforce, and tracking.
- API routing is role-aware and supports both management and agent endpoint families.
- Existing middleware enforces access role scope at API layer.
- Realtime stack exists with websocket filtering by company and role.

### Existing guardrails to reuse
- Company scoping model based on company_id.
- Company membership and role model via company_users.
- Existing throttle middleware and Redis stack.
- Existing test infrastructure for backend feature tests and frontend hook/component tests.

## Architectural Direction

### Copilot request path
Next.js UI -> Laravel Copilot Gateway -> Intent + Policy + Tool Router -> Existing Domain Services -> Optional AI Provider

### Decision rule before AI provider call
For each user prompt:
1. Can direct deterministic service answer this?
2. Can cached Redis memory answer this?
3. Is this an actionable command requiring workflow execution?
4. Only then call external LLM provider.

### Four-brain runtime mapping

#### Brain 1: General Knowledge
- Used when prompt is outside tenant data scope.
- Provider-backed answer with no organization data attached.

#### Brain 2: Organization Intelligence
- Tool-calling over existing read services.
- Strict user, company, role, and permission scoped retrieval.

#### Brain 3: Action Engine
- Action tools call existing write services.
- Confirmation gate for high-impact actions.
- Idempotency keys for safe retries.

#### Brain 4: Executive Analyst
- Large-context analysis over summarized, scoped data packs.
- Scheduled and on-demand executive reports.

## Security and Governance Baseline

### Mandatory request context
Every copilot request resolves and stores:
- user_id
- company_id
- role
- access_scope
- trace_id

### Enforcement points
- Middleware: authentication + role scope
- Tool policy layer: per-tool permission checks
- Service layer: final company_id constraints in queries
- Response redaction: hide blocked fields/entities

### Prompt injection controls
- Tool whitelist per role
- Explicit model instructions to ignore user attempts to override policy
- No provider direct database access
- Structured tool output contracts only

### Data minimization
- Send minimum required fields to model
- Mask sensitive fields (email, phone, payroll internals) by policy
- Redact PII in logs where required

## Organization Memory (Redis)

### Key design
- copilot:thread:{company_id}:{user_id}:{thread_id}
- copilot:summary:{company_id}:{thread_id}
- copilot:prefs:{company_id}:{user_id}
- copilot:faq:{company_id}
- copilot:usage:{company_id}:{yyyy_mm}

### Memory strategy
- Keep recent short window of messages
- Maintain rolling summary snapshots
- Compress context before each model invocation
- Never send full historical transcript

## Tooling Strategy

### Tool categories
- Read tools: crm, tasks, projects, attendance, payroll, meetings, tracking, notifications, dashboard
- Action tools: create/update/assign/schedule/notify/export workflows
- Automation tools: convert natural language to workflow rule definitions

### Tool contract requirements
- Explicit schema validation for all tool inputs
- Explicit schema validation for all tool outputs
- Role and tenant policy check before execution
- Audit entry per tool invocation

## Credit, Cost, and Usage Metering

Track at organization and user level:
- provider
- model
- prompt_tokens
- completion_tokens
- total_tokens
- tool_calls_count
- execution_ms
- estimated_cost
- credits_consumed

## Audit Logging

Persist each interaction:
- company_id, user_id, role
- prompt, normalized_intent
- provider/model used
- tools requested and executed
- action outcomes
- denied attempts
- usage metrics
- timestamp + trace_id

## Frontend Integration Plan

Do not redesign widget. Keep existing UX shell and wire behavior.

### Required UX support
- Streaming responses
- Typing indicator from stream state
- Conversation history loading
- Suggested prompts by role/module
- Action confirmation UI for write operations
- Progress updates for long-running reports/actions

## Incremental Delivery Plan

## Phase 0: Foundations (Audit complete)
- Inventory reusable services and route families
- Confirm role and tenant enforcement strategy
- Confirm realtime/filtering baseline

## Phase 1: Copilot gateway and read-only slice

### Backend
Create:
- app/Http/Controllers/Api/V1/AI/CopilotController.php
- app/Services/AI/CopilotService.php
- app/Services/AI/IntentClassifier.php
- app/Services/AI/Policy/ToolPolicyService.php
- app/Services/AI/Tools/ReadToolRegistry.php
- app/Services/AI/Context/ConversationMemoryService.php

Add route group under authenticated API:
- POST /copilot/chat
- GET /copilot/threads
- GET /copilot/threads/{thread}
- DELETE /copilot/threads/{thread}

Initial read tools (no writes):
- crm.top_leads
- tasks.overdue
- projects.at_risk_summary
- attendance.today_summary
- meetings.today
- tracking.active_agents
- dashboard.overview

### Frontend
Create:
- lib/api/copilot.ts
- hooks/use-copilot-chat.ts

Update:
- components/dashboard/ai-chat.tsx

Behavior:
- Replace dummy responses with streaming server responses
- Persist thread id and message history
- Show source tags for tool-backed answers

### Tests
- backend/src/tests/Feature/AI/CopilotReadFlowTest.php
- backend/src/tests/Feature/AI/CopilotTenantIsolationTest.php
- backend/src/tests/Feature/AI/CopilotRoleAccessTest.php
- hooks/use-copilot-chat.test.tsx
- components/dashboard/ai-chat.test.tsx

## Phase 2: Action engine (safe writes)
Add action tools with explicit confirmation policy:
- tasks.create
- tasks.reassign
- meetings.schedule
- notifications.send
- projects.create

Add idempotency and rollback-safe handling where needed.

Add tests for:
- allowed role action execution
- denied role action execution
- cross-tenant rejection
- duplicate request idempotency

### Phase 2 API contract additions

#### Copilot chat request extensions
`POST /copilot/chat`

Additional optional fields:
- `action_args` (object)
- `action_confirmed` (boolean)
- `idempotency_key` (string, max 120)

#### Confirmation handshake contract
When a write action is detected but not confirmed, assistant payload returns:
- `confirmation_required: true`
- `tool: <action tool>`
- `action_args: <normalized action args>`

Client confirms by resubmitting original request with:
- `action_confirmed: true`
- `action_args: <assistant-provided action_args>`
- `idempotency_key: <client-generated uuid>`

#### Action arg schema quick reference
- `tasks.create`
: `title`, `type`, `description`, `location`, `address`, `due_date`, optional assignment and coordinates.
- `tasks.reassign`
: `task_id`, `to_user_id`, optional `reason`.
- `meetings.schedule`
: `title`, `timezone`, `start_at`, `end_at`, optional attendees/reminders/description/location.
- `notifications.send`
: `title`, `message`, plus either `user_ids[]` or `roles[]`.
- `projects.create`
: `name`, `start_date`, optional `description`, `status`, `priority`, `assigned_team`.

## Phase 3: Executive analyst and reporting
- Build analytics context pack from existing aggregate services.
- Add weekly summary generation endpoints/jobs.
- Add downloadable report payloads and progress events.

### Phase 3 API endpoints
- `GET /copilot/analytics/context-pack`
: Returns role-scoped executive analytics context pack assembled from existing aggregates.
- `POST /copilot/reports/weekly-summary`
: Queues weekly summary generation and returns `report_id`.
- `GET /copilot/reports/weekly-summary/{reportId}`
: Returns job/report status and progress metadata.
- `GET /copilot/reports/weekly-summary/{reportId}/download`
: Downloads generated summary JSON when status is completed.

### Phase 3 progress events
Realtime event channel payloads use:
- event: `copilot.reports.weekly.progress`
- data: `{ report_id, status, progress, error? }`

## Phase 4: Natural language automations
- Translate NL rules into internal workflow rule JSON.
- Validate against policy and available triggers/actions.
- Persist and execute with queue workers.

### Phase 4 API endpoints
- `POST /copilot/automations/preview`
: Translates NL prompt into rule JSON without persistence.
- `POST /copilot/automations`
: Persists automation rule from NL prompt and optional run-now dispatch.
- `GET /copilot/automations`
: Lists automation rules in active company scope.
- `POST /copilot/automations/{automation}/run`
: Queues immediate execution for a persisted rule.

### Phase 4 persisted rule shape
`ai_automation_rules` stores:
- `company_id`, `created_by_user_id`, `name`, `prompt`
- `trigger_type`, `trigger_expression`
- `action_tool`, `action_args`
- `status`, `last_run_at`

## Phase 5: Future-ready extensions
- Voice input pipeline
- File analysis pipeline (PDF/XLSX)
- Meeting transcript summarization
- Advanced forecasting and recommendations

### Phase 5 API endpoints
- `POST /copilot/voice/transcriptions`
: Accepts audio file upload and returns transcription pipeline payload.
- `POST /copilot/files/analyze`
: Accepts PDF/XLSX/XLS/CSV uploads and returns analysis pipeline payload.
- `POST /copilot/meetings/transcripts/summarize`
: Accepts transcript text (and optional `meeting_id`) and returns key points plus action items.
- `GET /copilot/forecast/overview`
: Returns KPI/payroll-informed forecast snapshot and prioritized recommendations.

### Phase 5 frontend integration
- Add quick actions in copilot chat for:
: weekly summary queue + status polling + download
: voice upload transcription
: file analysis upload
: transcript summarization
: forecast overview pull

## Data and Schema Additions

Recommended new tables:
- ai_threads
- ai_messages
- ai_tool_invocations
- ai_usage_ledgers
- ai_credit_ledger
- ai_audit_logs
- ai_automation_rules

Indexes:
- (company_id, created_at)
- (user_id, created_at)
- (thread_id, created_at)
- (trace_id)

## Provider Strategy

Initial practical baseline:
- OpenAI for reliable tool calling and orchestration
- Claude optional for long-context executive analysis

Provider abstraction:
- App\Services\AI\Providers\AiProviderContract
- App\Services\AI\Providers\OpenAiProvider
- App\Services\AI\Providers\ClaudeProvider

## Environment and Config

Add env variables:
- AI_PROVIDER
- AI_FALLBACK_PROVIDER
- AI_DEFAULT_MODEL
- AI_EXEC_MODEL
- AI_ANALYST_MODEL
- AI_REQUEST_TIMEOUT_MS
- AI_MAX_TOKENS
- AI_ENABLE_STREAMING
- AI_ENABLE_ACTIONS
- AI_MONTHLY_ORG_CREDIT_LIMIT
- AI_PII_REDACTION_ENABLED

## Definition of Done for Phase 1
- Existing chat widget calls backend successfully.
- Read-only copilot responses come from tool-backed, tenant-scoped data.
- Agent cannot retrieve management-only data.
- Cross-organization leakage tests pass.
- Usage and audit records are persisted.
- Streaming and typing indicators work in current UI.

## Immediate Next Build Slice
Implement Phase 1 in this exact sequence:
1. Backend AI module skeleton + route registration
2. Tool policy + conversation memory service
3. Three read tools first (top leads, overdue tasks, meetings today)
4. Frontend API hook and chat wiring
5. Phase 1 feature and hook tests
6. Expand read tool set to remaining modules
