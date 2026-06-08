# Factory23 AI Admin Guide

## 1. Admin Responsibilities
- Configure provider keys and AI behavior flags.
- Monitor AI health, usage, costs, and failures.
- Review AI logs for support, audit, and incident response.
- Enforce role and organization policy integrity.

## 2. Environment Configuration
Use backend server-side environment values only.

```env
AI_PROVIDER=openai
AI_FALLBACK_PROVIDER=claude
AI_DEFAULT_MODEL=gpt-4.1-mini
AI_EXEC_MODEL=gpt-4.1-mini
AI_ANALYST_MODEL=claude-3-5-sonnet-latest
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_TOKENS=4000
AI_ENABLE_STREAMING=true
AI_ENABLE_ACTIONS=true
AI_MONTHLY_ORG_CREDIT_LIMIT=0
AI_PII_REDACTION_ENABLED=true
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
OPENAI_AUDIO_MODEL=gpt-4o-mini-transcribe
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_VERSION=2023-06-01
CLAUDE_MODEL=claude-3-5-sonnet-latest
```

Variable notes:
- `AI_PROVIDER`: primary provider used first.
- `AI_FALLBACK_PROVIDER`: secondary provider if primary fails.
- `AI_EXEC_MODEL`: model used for action/general execution prompts.
- `AI_ANALYST_MODEL`: model used for deeper analysis contexts.
- `AI_MAX_TOKENS`: upper bound for provider text generation.
- `AI_ENABLE_ACTIONS`: emergency switch for disabling write actions.
- `AI_MONTHLY_ORG_CREDIT_LIMIT`: per-org monthly cap (0 = unlimited).
- `AI_PII_REDACTION_ENABLED`: redacts email/phone patterns in stored output.

### Complete Variable Reference
- `AI_PROVIDER`
	- Primary provider id used first by the router (`openai` or `claude`).
- `AI_FALLBACK_PROVIDER`
	- Secondary provider id attempted when primary returns no usable result.
- `AI_DEFAULT_MODEL`
	- General default model baseline used when provider-specific model is not explicitly passed.
- `AI_EXEC_MODEL`
	- Preferred model for interactive execution/general-response paths in Copilot service.
- `AI_ANALYST_MODEL`
	- Preferred model for deeper analysis/report-style generation paths.
- `AI_REQUEST_TIMEOUT_MS`
	- HTTP timeout budget for provider calls.
- `AI_MAX_TOKENS`
	- Maximum generation token cap enforced by provider adapters.
- `AI_ENABLE_STREAMING`
	- Enables SSE streaming response mode for chat endpoint.
- `AI_ENABLE_ACTIONS`
	- Enables/disables action tool execution globally.
- `AI_MONTHLY_ORG_CREDIT_LIMIT`
	- Monthly credit cap per organization (0 means unlimited).
- `AI_PII_REDACTION_ENABLED`
	- Enables regex-based redaction of emails and phone numbers in stored/chat output flow.
- `OPENAI_API_KEY`
	- Secret key for OpenAI API authentication.
- `OPENAI_BASE_URL`
	- OpenAI API base URL (override for proxy or regional routing if required).
- `OPENAI_MODEL`
	- Default OpenAI chat model for provider-level calls.
- `OPENAI_AUDIO_MODEL`
	- OpenAI audio transcription model used in voice pipeline.
- `ANTHROPIC_API_KEY`
	- Secret key for Claude (Anthropic) API authentication.
- `ANTHROPIC_BASE_URL`
	- Anthropic API base URL.
- `ANTHROPIC_VERSION`
	- Required Anthropic API version header value.
- `CLAUDE_MODEL`
	- Default Claude model for provider-level text generation.

Compatibility note:
- Some planning docs may reference `AI_EXECUTE_MODEL` and `AI_PII_REDACTION`.
- Current implementation uses `AI_EXEC_MODEL` and `AI_PII_REDACTION_ENABLED`.

## 3. Admin Dashboard Surfaces
Available under `/admin/ai`:
- Overview (`/admin/ai`)
- Analytics (`/admin/ai/analytics`)
- Logs list (`/admin/ai/logs`)
- Log detail (`/admin/ai/logs/{id}`)
- Health check JSON (`/admin/ai/health`)

## 4. Health Check Meanings
`/admin/ai/health` checks:
- OpenAI
- Claude
- Redis
- Queue

Common statuses:
- `reachable`: API/service is available.
- `not_configured`: key missing.
- `auth_failed`: invalid key.
- `quota_exceeded`: billing/credits exhausted.
- `unreachable`: network or provider outage.

## 5. Logging and Retention
Log table:
- `ai_logs`

Captured fields include:
- company/user/session
- provider/model
- prompt metadata
- tokens and estimated cost
- status and errors
- execution duration
- intent type and tool name

Retention:
- Daily scheduled prune at 03:00.
- Command: `php artisan ai:prune-logs --days=30`

## 6. Cost Management and Budget Protection
Implemented controls:
- Per-org monthly credit counter in cache.
- Hard block when org reaches configured limit.
- Provider/model token-cost estimation persisted in logs.

Admin actions:
- Set non-zero `AI_MONTHLY_ORG_CREDIT_LIMIT` for budget control.
- Review analytics for cost drift by provider.

## 7. Permission and Tenant Controls
- AI always resolves active company context before execution.
- Unauthorized `company_id` requests are rejected.
- Tool access is role-dependent.
- Agents are read-only and more restricted.

## 8. Operations Runbook
Daily:
- Check `/admin/ai` status and errors.
- Verify failed/timeout trend.
- Inspect top failing prompts/tools.

Weekly:
- Review provider cost split and token growth.
- Audit denied actions and policy blocks.
- Confirm queue and Redis performance.

Monthly:
- Reevaluate credit limits and model settings.
- Rotate provider keys if required by policy.

## 9. Incident Response Quick Steps
1. Confirm `/admin/ai/health` status.
2. If provider auth issue, verify key and environment reload.
3. If high failure rate, temporarily set `AI_ENABLE_ACTIONS=false`.
4. Review recent failed logs and error_code distribution.
5. Validate queue backlog and worker uptime.
6. Restore normal mode after successful smoke tests.
