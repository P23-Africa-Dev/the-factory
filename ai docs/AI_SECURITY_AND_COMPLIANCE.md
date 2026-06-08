# Factory23 AI Security and Compliance

## 1. Security Objectives
Factory23 AI is designed to ensure:
- strict tenant isolation,
- role-constrained access,
- controlled write execution,
- auditable request lifecycle,
- safe handling of sensitive content.

## 2. Tenant Isolation Model
Tenant context is centrally resolved through `CompanyContextService`.

Rules:
- Request may include `company_id`.
- User must belong to selected active company.
- Without `company_id`, latest active membership is selected.
- Invalid/missing membership triggers validation error and blocks execution.

## 3. Cross-Tenant Protection
Cross-company access is prevented by:
- Context resolution before tool/provider processing.
- Tool queries constrained by resolved `company_id`.
- Memory keys scoped by company + user.
- Report status keys scoped by company + user + report ID.
- Automation run checks company ownership before execution.

## 4. Role-Based Permission Enforcement
Policy service controls allowed tools per role.

Management roles (`owner`, `admin`, `supervisor`):
- Access read and action tools.

Agent role:
- Access limited read tools only.
- No action tool execution.

Denied requests return role-scope policy responses and are logged.

## 5. Action Safety Controls
For every action tool:
- Request payload validation is enforced.
- Confirmation is required before execution.
- Optional idempotency key protects against duplicate writes.
- Automation jobs re-check role and membership at execution time.

## 6. Data Handling and PII Redaction
Config flag:
- `AI_PII_REDACTION_ENABLED=true` (recommended)

Current redaction behavior:
- Email patterns replaced with `[redacted-email]`.
- Phone patterns replaced with `[redacted-phone]`.
- Applied to stored user prompt/assistant text flow where configured.

## 7. Audit and Traceability
`AiLog` stores:
- actor and company context,
- provider/model,
- prompt and sanitized prompt,
- token and estimated cost fields,
- execution time,
- intent type and tool name,
- status and error details.

This supports incident analysis, forensics, and governance reporting.

## 8. Log Retention Compliance
Retention policy:
- 30-day default retention.

Mechanism:
- Scheduled command `ai:prune-logs --days=30` daily at 03:00.

## 9. Provider Credential Security
Requirements:
- Keep keys server-side only.
- Never expose provider keys in frontend runtime variables.
- Rotate keys periodically and immediately after incident suspicion.
- Restrict deployment-level secret access to least privilege.

## 10. Availability and Resilience Controls
- Provider failover sequence: primary -> fallback.
- Health endpoint checks provider auth/reachability and infra dependencies.
- Queue/Redis health included for operational readiness.

## 11. Cost Abuse and Runaway Protection
- Per-org monthly credit counter and hard stop limit.
- Action disable switch (`AI_ENABLE_ACTIONS`) for emergency containment.
- Analytics for provider/token/cost trends.

## 12. Recommended Compliance Enhancements
For stricter enterprise governance, consider:
- immutable audit export pipeline,
- per-tool approval policies by business unit,
- SIEM forwarding for failed/denied AI requests,
- encryption policy review for long-term AI artifacts.
