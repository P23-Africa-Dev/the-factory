# Real-Time Tracking — Production Readiness Check (2026-11-19)

Checked on the prod droplet `144.126.227.55` (`/opt/factory`), backend image `29e59a4` (= `main` HEAD).
All checks were read-only. The only write was one Redis PUBLISH to `factory23.tracking.company.0`, a company ID with no viewers.

## Implementation status (2026-11-19)

P0 fixes are live as `f106021`. Items marked *pending deploy* are in the working tree (not yet committed) and go live on the next push to `main`.

| Item | Status | Where |
|---|---|---|
| P0-1 Supervisor scoping on live stream | ✅ Done | New `GET /api/v1/tracking/socket-authorization` (`TrackingSocketAuthorizationService`) returns scope + visible agent IDs; relay `filtering.js` enforces `company` / `supervisor` / `self`; re-checked every 5 min |
| P0-2 Task subscription ownership | ✅ Done | Relay only keeps task IDs the API returns in `allowed_task_ids` (assignee / observer / creator; supervisor: their agents' tasks); `TASK_FORBIDDEN` otherwise |
| P0-3 Company mismatch auth loop | ✅ Done | API validates *membership* in the requested company (internal or public ID) instead of exact match with the default company; failures log `companyHint`/status; permanent failures close with `4403` + `retryable:false`, and both clients stop reconnecting and fall back to REST polling |
| P0-4 Live end-to-end test on prod | ✅ Done, 27/27 checks | Temporary company + owner/supervisor/2 agents; full journey over public `wss://`; results below; all test data deleted afterwards |
| P1-5 Token in WS URL (agent PWA) | ✅ Done | PWA sends `authenticate` message after open; relay logs any remaining `?token=` use as deprecated |
| P1-6 Slim relay env | ✅ Done on prod | Relay now uses `/opt/factory/env/factory23-realtime.env` (14 tracking-only keys, mode 600); compose backup `docker-compose.yml.bak-realtime-env-*`; re-verified live |
| P1-7 Relay in CI deploy | ✅ Done | `deploy.yml` builds `factory-reg/realtime:<sha>` and recreates it after the API, with a `/healthz` gate |
| P1-8 Tests in CI | ✅ Done (tracking subset) | `deploy.yml` runs tracking feature tests + relay `npm test` before build |
| P1-9 Monitoring | ✅ Built, *pending deploy* | Relay `/healthz` reports 15-min auth success/failure counts. `tracking:health` checks the relay (reachable, Redis ready, auth-failure spike) and runs every 5 min with `--notify`, which logs `[tracking-alert]` errors and emails `TRACKING_ALERT_EMAILS` (1/hour per alert). `TRACKING_REALTIME_HEALTH_URL` added to prod env. Alerts go to `TRACKING_ALERT_EMAILS=nurudeen@p23africa.co.uk` via the default mailer (Resend). SMTP was tried first but ports 25/465/587 are blocked on the droplet (DigitalOcean default); `TRACKING_ALERT_MAILER` can switch to `smtp` if DO lifts the block. A test alert was delivered to Resend on 2026-11-19. |
| Extra: supervisor route history | ✅ Fixed, *pending deploy* | `GET /tasks/{id}/route` let supervisors read the location trail of any agent's task; now limited to their agents' tasks / tasks they created (same rule as live map) |

Also fixed: `TaskTrackingRegressionTest::test_accuracy_zero_still_allows_near_and_arrival` used timestamps 2–3 min in the future (clamped by the 120 s skew guard) and 3 km jumps in 30 s (anti-teleport filter). Test-only bug; the service logic was correct.

Tests: 40 backend tracking tests and 18 relay tests pass locally.

### Verified on prod after deploy (`f106021`, 10:46 UTC)
- Relay `realtime:f106021` running, Redis ready, sockets re-authenticated through the new endpoint within seconds.
- Scopes observed: owners/admins `company` (all), supervisor 141 (company 84) sees 1 agent, supervisors 213/214 (company 98) see 0. Company 98 has no agents, so that is correct.
- Zero relay auth warnings since deploy. Before, there were about 230 a day.
- Deploy runs 1–2 failed *after* deploying: (1) the relay image was tagged `latest` instead of the SHA (fixed: explicit short-SHA step); (2) the health gate used `grep && break`, which aborts under `script_stop` (fixed: if-block). Both fixes pushed.

### Live end-to-end test on prod (11:53 UTC, 27/27 passed)
Fixture: temporary company `FAC-E2E-TRACK-20261119115326` (id 100) with an owner, a supervisor, agent A (supervised), agent B (not supervised), and one task each. Drove the real API and watched four live sockets on `wss://api.thefactory23.com/tracking-ws`.

- Auth: owner `scope=company`, supervisor `scope=supervisor`, agents `scope=self`. A non-member company was rejected permanently (`4403`, "not attached to the selected company").
- Agent B's attempt to follow agent A's task was dropped at connect, and `subscribe_task` was refused with `TASK_FORBIDDEN`.
- Agent A journey: start → 2 movement pings → **near** at ~155 m → **arrival** at ~8 m → **complete**; task ended `completed`.
- Live delivery:
  - owner received all of A's events (started, location, near, arrived, completed) and B's
  - supervisor received A's 16 events and **0** of B's
  - each agent received only their own events
- REST matches: owner sees both agents; supervisor sees only A; agent B cannot read A's location.
- After switching the relay to its slim env: owner still receives B's live events, and the supervisor still does not.
- Cleanup: 41 rows deleted (company, 4 users, 4 tokens, 2 tasks, 2 sessions, 9 points, 2 snapshots, 13 in-app notifications, 4 memberships). The re-scan found no leftovers. No emails or pushes were sent (tracking notifications are in-app/push only, and the test users had no devices).

### Deploy order / compatibility
- Backend must be live before the new relay (the relay calls the new endpoint). `deploy.yml` already does API → migrate → relay.
- Old clients keep working: the relay still accepts `?token=`, and `access_role` stays `management|agent`.
- Supervisors will now see only their own agents on the live map (intended change).

## What is working

| Check | Result |
|---|---|
| API health `https://api.thefactory23.com/api/v1/health` | OK (production) |
| Public WebSocket `wss://api.thefactory23.com/tracking-ws` (Caddy → nginx → relay) | HTTP 101 upgrade OK |
| Relay `/healthz` | `ok`, Redis `ready`, 13 days uptime, 0 restarts |
| Relay subscribed to Redis `factory23.tracking.company.*` | Yes (1 pattern subscriber) |
| Laravel `pubsub` connection → relay | PUBLISH reached 1 receiver ✅ |
| Dashboard sockets authenticating | Yes (companies 12, 84, 98 seen today) |
| Scheduler: `tracking:sweep-abandoned` (15 min), `tracking:prune` (02:00) | Running, DONE |
| `tracking:health` | 0 open / 0 abandoned sessions, no alert |
| Queue worker | Healthy (restarts hourly by `--max-time=3600`, by design) |
| Failed jobs (24h) | 0 |

## What is NOT proven yet

- **No real agent tracking has run recently.** There are only 2 tracking sessions ever. The last one started 2026-10-29, there are 20 location points in total, and nothing in the last 7 days. All 4 agent snapshots are stale.
- So the full agent flow (start → location pings → arrival → complete → live map update) has not been run on the current build. We need one controlled live test (see P0-4).

## Issues found

### P0 — fix before relying on it

1. **Supervisors see every agent's live location over the WebSocket (privacy leak).**
   `backend/realtime-server/src/filtering.js` maps `supervisor` → `management`, and `management` gets every event in the company.
   The REST API (`AgentLocationSnapshotService`) correctly limits supervisors to agents with `supervisor_user_id = them`. The live stream does not.
   *Fix:* keep `supervisor` as its own access role. At auth time, load the IDs of that supervisor's agents (new internal endpoint, or extend `/user/me`), and only deliver events whose `user_id` is in that set. Refresh the set periodically or on reconnect.

2. **Any agent can subscribe to any task in their company and see another agent's live location.**
   The `subscribe_task` message and the `task_ids` sent at connect are accepted with no ownership check (`server.js` ~L143, ~L284).
   *Fix:* validate each task ID against the API (assignee/observer of the task) before adding it. Drop it otherwise.

3. **1,627 WebSocket auth failures in 7 days: "Token company context does not match requested company."**
   The relay only accepts the company that `/user/me` returns as `active_company`. If a client sends a different (stale or switched) company ID, the client is rejected and keeps reconnecting, so that viewer gets no live updates.
   *Fix:*
   (a) Log `userId` and the requested company on failure, to find which client is doing this (likely the agent PWA's stored `getActiveCompanyId()`).
   (b) Have the relay validate *membership* in the requested company instead of exact equality (pass company to the auth call, e.g. a header/query that `CompanyContextService::resolve` honours).
   (c) Stop the client from retrying on `AUTH_FAILED`.

4. **Run one controlled end-to-end live test on prod.**
   Use a dedicated test company with one test agent and one test supervisor, and a task that has a destination. Walk it: start → ~10 location pings while moving → near → arrival → complete. Confirm all of these:
   - the owner map updates live
   - the supervisor sees only their agent
   - the snapshot/REST views match
   - the session closes

   This needs your go-ahead and test accounts (it writes real rows to prod).

### P1 — hardening

5. **Agent PWA puts the bearer token in the WebSocket URL** (`the-factory-agent-pwa/src/hooks/useTrackingWebSocket.ts:210`). Tokens reached nginx logs 5 times this week.
   *Fix:* use the post-open `authenticate` message, as the web dashboard already does (`hooks/use-tracking-ws.ts`).
6. **Relay container gets the full `env/factory23.env`** (Stripe, Anthropic, OpenAI, DB root password, etc.).
   *Fix:* give `factory23-realtime` its own small env file with only `TRACKING_WS_*`, `TASK_TRACKING_REDIS_CHANNEL_PREFIX`, and Redis creds.
7. **Relay is deployed by hand with a mutable `realtime:v1` tag**, outside the CI deploy.
   *Fix:* build and push it in `deploy.yml` with the commit SHA tag, and recreate it like the PHP services.
8. **Automated tests are disabled in CI** (`deploy.yml` "Run tests" is commented out).
   *Fix:* at minimum, run the tracking feature tests and the realtime-server tests on each deploy.
9. **Monitoring:**
   - Alert on relay auth-failure rate and on `/healthz` failing.
   - Log auth failures with `userId`.
   - Many closes are `1006` (abnormal). Check the client heartbeat/reconnect behaviour once P0-3 is fixed.
