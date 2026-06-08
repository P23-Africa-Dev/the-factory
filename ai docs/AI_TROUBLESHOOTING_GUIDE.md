# Factory23 AI Troubleshooting Guide

## 1. Common Issues and Fixes

### Issue A: Missing API Keys
Symptoms:
- Health endpoint returns `not_configured`.
- General AI responses fall back to default text.

Checks:
1. Verify `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` in backend environment.
2. Confirm container/service restart after env update.
3. Confirm `/admin/ai/health` reflects configured status.

### Issue B: Provider Timeout or Unreachable
Symptoms:
- Increased failed requests.
- Health check reports `unreachable`.

Checks:
1. Verify egress network and DNS on server.
2. Confirm `AI_REQUEST_TIMEOUT_MS` is appropriate.
3. Review provider status pages.
4. Ensure fallback provider is configured.

### Issue C: Action Execution Denied
Symptoms:
- AI returns permission denial or confirmation-required response.

Checks:
1. Confirm role in company membership.
2. Confirm tool allowlist includes requested action.
3. Confirm `action_confirmed=true` on second call.
4. Ensure `AI_ENABLE_ACTIONS=true`.

### Issue D: Organization Mismatch
Symptoms:
- Validation error for `company_id`.

Checks:
1. Confirm user belongs to target company.
2. Confirm company is active.
3. Omit `company_id` to use latest active membership if appropriate.

### Issue E: Queue/Report Delays
Symptoms:
- Weekly report stuck at queued/running.

Checks:
1. Verify queue workers are running.
2. Check queue backlog and failed jobs.
3. Confirm Redis health and connectivity.
4. Review job exceptions in logs.

## 2. Debugging Process (Step-by-Step)
1. Reproduce with exact request payload.
2. Check `/admin/ai/health` immediately.
3. Search `ai_logs` for session/user and inspect status/error.
4. Validate role/tool policy conditions.
5. Verify queue/redis status for async workflows.
6. Verify environment flags (`AI_ENABLE_ACTIONS`, credit limit, redaction).
7. Retest after one controlled fix at a time.

## 3. Health and Validation Commands
- Check scheduled tasks and workers.
- Check AI logs retention command manually:
  - `php artisan ai:prune-logs --days=30`

- Run targeted tests (when terminal supports execution):
  - `php artisan test --filter="AiProviderRoutingTest|CopilotPhaseFiveInnovationTest"`

## 4. Production Readiness Checklist
Required services:
- OpenAI and/or Claude keys configured.
- Redis available.
- Queue workers online (Horizon or equivalent worker process manager).
- Scheduler online.
- Admin AI routes accessible.
- WebSocket/realtime service online for progress events and realtime notifications.

Configuration checklist:
- `AI_PROVIDER` and `AI_FALLBACK_PROVIDER` set.
- `AI_MAX_TOKENS`, `AI_REQUEST_TIMEOUT_MS` set to sane values.
- `AI_PII_REDACTION_ENABLED=true` in production.
- Monthly credit limit set if budget control required.

Monitoring note:
- Current built-in AI health endpoint checks OpenAI, Claude, Redis, and queue state.
- WebSocket health should be monitored via the platform's realtime service health endpoint and infrastructure telemetry.

## 5. Incident Severity Guide
- Sev 1: AI unavailable for all users.
- Sev 2: Action engine unavailable, read paths functioning.
- Sev 3: Elevated latency/failure but partial service available.
- Sev 4: Non-critical feature regression (e.g., one tool path).

## 6. Escalation Data to Collect
Before escalation, capture:
- timestamp and environment
- user id and company id
- endpoint and payload (sanitized)
- ai_log id(s)
- health endpoint response
- queue pending/failed counts
- provider status evidence

## 7. Future Hardening Recommendations
- Add automated alerting on AI failure-rate thresholds.
- Add dashboard alert for missing provider keys in production.
- Add synthetic canary checks for general and action paths.
- Add explicit retry/backoff policy where needed.
