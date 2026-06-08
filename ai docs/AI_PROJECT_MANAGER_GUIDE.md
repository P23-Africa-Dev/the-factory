# Factory23 AI Project Manager Guide

## Audience
This guide is for project managers, product owners, and business stakeholders who need a practical understanding of AI capabilities, delivery impact, governance, and rollout planning.

## What Factory23 AI Delivers
Factory23 AI is an operations assistant embedded into the platform workflow, not a separate chatbot product.

Business-facing capabilities:
- Answers operational questions using company data.
- Executes approved actions (task, meeting, notification, project workflows).
- Runs automation rules from natural-language prompts.
- Produces weekly executive summaries asynchronously.
- Supports quick-access actions for voice, file analysis, transcript summary, and forecast views.

## Core Business Problems Solved
- Slow decision-making due to fragmented data across modules.
- Repetitive manual coordination steps.
- Delays in executive reporting and operational visibility.
- Inconsistent execution quality for routine workflows.

## Expected Productivity Gains
Typical gain drivers:
- Faster information retrieval (read tools avoid manual dashboard hopping).
- Reduced manual task orchestration (AI actions + automations).
- Better operational follow-through (confirmation-gated action execution).
- Faster leadership reporting (queue-based weekly summary with progress tracking).

## How AI Makes Decisions (Business View)
1. Understand user intent (question, read request, or action request).
2. Check user role permissions and active company context.
3. Route to secure internal tools or provider-backed response logic.
4. Enforce confirmation before write actions.
5. Return response with source/tool trace.

## AI Brains (Business Language)
- Brain 1: General Guidance
  - Handles strategy/explanation prompts.
  - Uses provider routing (OpenAI primary, Claude fallback).
- Brain 2: Company Intelligence
  - Reads tenant-scoped operational data.
  - Returns summaries for leads, tasks, projects, attendance, meetings, tracking, dashboard.
- Brain 3: Action & Automation
  - Executes validated actions.
  - Applies strict policy, confirmation, and audit logging.

## Business Governance Rules
- Company data isolation is mandatory and enforced by context resolution.
- Role-based restrictions prevent unauthorized data/action access.
- AI actions can be globally disabled by configuration when needed.
- Monthly org credit limits can cap usage to protect budgets.

## Role Expectations
- Owner/Admin/Supervisor:
  - Broad read visibility plus action execution.
- Agent:
  - Personal/team-limited read scope.
  - No action tool execution.

## Scope Coverage by Module (Current)
Operationally integrated today:
- CRM (top leads read)
- Tasks (overdue read, create, reassign)
- Projects (risk read, create)
- Attendance (today summary)
- Meetings (today read, schedule)
- Tracking (active agents read for management)
- Notifications (send)
- Dashboard overview
- Reporting and automations

Partially scaffolded (Phase 5 style):
- Voice transcription
- File analysis
- Transcript summarization
- Forecast recommendations

## Delivery Dependencies
For production usage, PMs should verify:
- OpenAI and/or Claude keys configured.
- Redis and queue workers stable.
- Scheduler running (for AI log pruning and other routines).
- Admin AI dashboard accessible for monitoring.

## KPI Suggestions for PM Tracking
- Request volume by module/team.
- AI response success rate.
- Average execution time.
- Action confirmation conversion rate.
- Automation runs/week and success rate.
- Weekly summary generation completion rate.
- Estimated AI cost by provider.

## Rollout Plan Recommendation
1. Pilot by role and module (management first).
2. Enable read-only use cases broadly.
3. Gradually enable actions per role group.
4. Introduce automation templates after action stability.
5. Enforce monthly credit limits once usage baseline is known.

## Risks and Mitigations
- Risk: Unexpected AI costs.
  - Mitigation: credit caps + provider analytics.
- Risk: Wrong action execution.
  - Mitigation: confirmation gate + payload validation + role policy.
- Risk: Cross-tenant concern.
  - Mitigation: mandatory company context resolution and scoped queries.
- Risk: Provider outage.
  - Mitigation: fallback provider routing + health checks.

## PM Operating Checklist
- Confirm AI environment configuration in each environment.
- Confirm role policy mapping with ops leadership.
- Review weekly AI analytics and failure trends.
- Track adoption and outcome metrics per department.
- Keep roadmap expectations clear: implemented vs scaffolded features.

## Future AI Roadmap (Planned)
- Voice Assistant (beyond current transcription scaffold)
- File Analysis deep extraction (PDF/XLSX semantic extraction)
- Document Intelligence workflows
- Predictive Analytics expansion
- Workflow Automation expansion (more trigger/action pairs)
- AI-powered CRM Insights beyond top-lead snapshots
- AI Workforce Optimization recommendations
- AI Forecasting depth upgrades (scenario simulation and confidence bands)
