# Factory23 AI Analytics and Logging

## 1. Purpose
This document explains how Factory23 measures AI usage, quality, cost, and reliability.

## 2. Logging Architecture
Primary components:
- `AiLoggingService`
- `AiLog` model/table (`ai_logs`)

Lifecycle:
1. Begin log entry before execution.
2. Complete with token/cost estimates on success.
3. Mark failed/timeout/cancelled on error or policy block.

## 3. Fields Logged
Current schema captures:
- company and user identifiers
- session/thread id
- provider and model
- raw prompt and sanitized prompt
- prompt length
- input/output/total token estimates
- estimated cost (USD)
- start/end timestamps and execution ms
- status (`success`, `failed`, `timeout`, `cancelled`)
- intent type and tool name
- error code/message and optional stack trace

## 4. Cost Estimation Model
Cost is estimated by provider+model token rates in `AiLog::estimateCost`.

Current pricing map includes:
- OpenAI (`gpt-4.1-mini`, `gpt-4o`, etc.)
- Claude (`claude-3-5-sonnet-latest`, etc.)

Formula:
- input cost = input_tokens / 1,000,000 * input_price
- output cost = output_tokens / 1,000,000 * output_price
- total cost = input cost + output cost

## 5. Analytics Aggregation
`AiLoggingService::analytics` provides:
- total requests
- successful and failed counts
- input/output/total tokens
- estimated total cost
- average execution time
- provider-level breakdown

## 6. Admin Analytics Dashboard
Admin routes provide:
- `/admin/ai` overview snapshot
- `/admin/ai/analytics` range analytics with daily series
- `/admin/ai/logs` searchable logs
- `/admin/ai/logs/{log}` detail view

### Control Dashboard Feature Matrix
Implemented now:
- Total requests
- Successful requests
- Failed requests
- Average response time
- Token consumption
- Provider split (usage + token + estimated cost)
- Daily request/token/cost trend
- Error monitoring via status/error fields
- AI logs viewer with filters

Roadmap/extension opportunities:
- Top users leaderboard by AI consumption
- Top organizations leaderboard in dashboard UI
- Automated threshold alerts inside dashboard cards

Daily and range views support:
- request trend
- token trend
- cost trend
- provider distribution
- failure visibility

## 7. Health Monitoring
`/admin/ai/health` checks:
- OpenAI API key validity/reachability
- Claude API key validity/reachability
- Redis cache functional test
- Queue pending/failed state

Statuses returned include:
- reachable
- not_configured
- auth_failed
- quota_exceeded
- unreachable

## 8. Log Retention and Cleanup
Retention command:
- `ai:prune-logs --days=30`

Schedule:
- Daily at 03:00 via scheduler.

Operational impact:
- Keeps analytics relevant while controlling storage growth.

## 9. Error Monitoring Recommendations
Use logs to monitor:
- provider auth failures
- quota exhaustion
- timeout spikes
- recurring tool validation failures
- permission denied spikes by role

## 10. KPI Definitions
Recommended core KPIs:
- Success rate = successful / total requests
- Failure rate = failed / total requests
- Avg latency = avg execution_ms
- Token intensity = total_tokens / total requests
- Cost per request = estimated_cost_usd / total requests

## 11. Governance Notes
- Logs are operationally rich and should be treated as sensitive data.
- Access to admin AI logs should be restricted to authorized admin roles.
- Consider masking policy for prompt inspection in high-compliance environments.
