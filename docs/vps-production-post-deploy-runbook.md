# Factory23 VPS Production Setup and Post-Deployment Runbook

This is a single-file, execution-ready guide for an AI agent (or operator) to set up and validate production on a DigitalOcean VPS for this stack:

- Frontend on Vercel
- Backend API (Laravel) on VPS via Docker Compose
- Redis on VPS via Docker Compose
- Realtime WebSocket relay on VPS via Docker Compose

Use this document as the exact operating procedure after each production release.

---

## 1) Required Architecture and Domain Layout

Expected production routing:

- Frontend: https://app.example.com (Vercel)
- API + WebSocket entrypoint: https://api.example.com (VPS)
- WebSocket browser URL: wss://api.example.com/tracking-ws

Service flow:

1. Laravel writes tracking events
2. Redis pub/sub receives events under company channel prefixes
3. Realtime relay consumes Redis channels and broadcasts via WS
4. Frontend map receives updates and renders agent/location/route state

---

## 2) Pre-Setup Inputs (Fill These First)

Replace all placeholder values below before running commands.

| Key | Example | Your Value |
|---|---|---|
| APP_DOMAIN | app.example.com | |
| API_DOMAIN | api.example.com | |
| VPS_IP | 203.0.113.10 | |
| SSH_USER | root or deploy | |
| REPO_URL | git@github.com:org/repo.git | |
| REPO_BRANCH | main | |
| VPS_APP_DIR | /opt/factory23 | |
| MYSQL_DB | factory23 | |
| MYSQL_USER | factory23_user | |
| MYSQL_PASSWORD | strong-db-password | |
| MYSQL_ROOT_PASSWORD | strong-root-password | |
| APP_KEY | base64:generated-laravel-key | |
| MAPBOX_PUBLIC_TOKEN | pk.... | |
| MAPBOX_SECRET_TOKEN | sk.... | |
| MAIL_HOST | smtp.provider.com | |
| MAIL_PORT | 587 | |
| MAIL_USERNAME | no-reply@example.com | |
| MAIL_PASSWORD | strong-mail-password | |
| MAIL_FROM_ADDRESS | operation@example.com | |

---

## 3) One-Time VPS Bootstrap

Run on VPS as privileged user:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg lsb-release git ufw

# Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable docker
systemctl start docker

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Security notes:

- Do not expose Redis publicly.
- Do not expose realtime internal port publicly.
- Keep only 80/443 and SSH open.

---

## 4) Clone Repository and Prepare Production Env Files

```bash
mkdir -p /opt
cd /opt
git clone <REPO_URL> factory23
cd factory23
git checkout <REPO_BRANCH>
```

Create/update files:

- backend/.env
- backend/src/.env
- backend/realtime-server/.env

### 4.1 backend/.env (Compose host env)

Use values aligned with backend/.env.example and deployment scripts:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://<API_DOMAIN>
APP_PORT=8080

DB_DATABASE=<MYSQL_DB>
DB_USERNAME=<MYSQL_USER>
DB_PASSWORD=<MYSQL_PASSWORD>
DB_ROOT_PASSWORD=<MYSQL_ROOT_PASSWORD>
MYSQL_PORT=3306

TZ=Africa/Lagos

TRACKING_WS_PORT_FORWARD=8081
TRACKING_WS_AUTH_API_BASE_URL=http://nginx
TRACKING_WS_AUTH_ME_PATH=/api/v1/user/me
TRACKING_WS_HEARTBEAT_MS=30000
TRACKING_WS_AUTH_TIMEOUT_MS=10000
TRACKING_WS_MAX_MESSAGE_BYTES=32768
TRACKING_WS_LOG_LEVEL=info
TRACKING_WS_REDIS_DB=0

TASK_TRACKING_REDIS_CHANNEL_PREFIX=factory23.tracking
```

### 4.2 backend/src/.env (Laravel runtime env)

Use values aligned with backend/src/.env.example:

```env
APP_NAME=Factory23
APP_ENV=production
APP_KEY=<APP_KEY>
APP_DEBUG=false
APP_URL=https://<API_DOMAIN>

LOG_CHANNEL=stack
LOG_LEVEL=info

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=<MYSQL_DB>
DB_USERNAME=<MYSQL_USER>
DB_PASSWORD=<MYSQL_PASSWORD>

CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis

REDIS_CLIENT=phpredis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=null

BROADCAST_CONNECTION=redis

TASK_TRACKING_ARRIVAL_RADIUS_METERS=75
TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS=15
TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS=20
TASK_TRACKING_MAX_BATCH_POINTS=50
TASK_TRACKING_REDIS_CHANNEL_PREFIX=factory23.tracking
TASK_TRACKING_RETENTION_DAYS=90
TASK_TRACKING_PRUNE_CHUNK_SIZE=1000

MAPBOX_PUBLIC_TOKEN=<MAPBOX_PUBLIC_TOKEN>
MAPBOX_SECRET_TOKEN=<MAPBOX_SECRET_TOKEN>
MAPBOX_DIRECTIONS_BASE_URL=https://api.mapbox.com
MAPBOX_DIRECTIONS_PROFILE=driving
MAPBOX_DIRECTIONS_GEOMETRIES=geojson
MAPBOX_DIRECTIONS_OVERVIEW=full
MAPBOX_DIRECTIONS_STEPS=false
MAPBOX_DIRECTIONS_ANNOTATIONS=distance,duration
MAPBOX_DIRECTIONS_MAX_COORDINATES=25

TRACKING_WS_PUBLIC_URL=wss://<API_DOMAIN>/tracking-ws
TRACKING_API_PUBLIC_URL=https://<API_DOMAIN>/api/v1

FRONTEND_URL=https://<APP_DOMAIN>
SANCTUM_STATEFUL_DOMAINS=<APP_DOMAIN>
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=none
SESSION_HTTP_ONLY=true

MAIL_MAILER=smtp
MAIL_HOST=<MAIL_HOST>
MAIL_PORT=<MAIL_PORT>
MAIL_USERNAME=<MAIL_USERNAME>
MAIL_PASSWORD=<MAIL_PASSWORD>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=<MAIL_FROM_ADDRESS>
MAIL_FROM_NAME="Factory 23"
```

### 4.3 backend/realtime-server/.env

```env
NODE_ENV=production
PORT=8081

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=

TRACKING_REDIS_CHANNEL_PREFIX=factory23.tracking
AUTH_API_BASE_URL=http://nginx
AUTH_ME_PATH=/api/v1/user/me
HEARTBEAT_MS=30000
AUTH_TIMEOUT_MS=10000
MAX_MESSAGE_BYTES=32768
LOG_LEVEL=info
```

---

## 5) Vercel Frontend Production Variables

Set in Vercel Project Settings -> Environment Variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://<API_DOMAIN>/api/v1
NEXT_PUBLIC_TRACKING_WS_URL=wss://<API_DOMAIN>/tracking-ws
NEXT_PUBLIC_MAPBOX_TOKEN=<MAPBOX_PUBLIC_TOKEN>
NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS=<API_DOMAIN>
```

After update, redeploy frontend.

---

## 6) Nginx Reverse Proxy Requirements (Host + Container)

Container-level proxy is already configured in backend/docker/nginx/default.conf to route:

- /tracking-ws -> realtime:8081

Host-level Nginx (or Caddy/Traefik) must:

1. Terminate TLS for api.example.com
2. Proxy traffic to container nginx at local mapped port
3. Preserve websocket upgrade headers for /tracking-ws

Required websocket headers on host proxy location:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_read_timeout 3600;
proxy_send_timeout 3600;
```

---

## 7) Deployment Procedure (Use Existing Script)

Preferred command (already in repo):

```bash
cd /opt/factory23/backend
bash scripts/deploy/production-monorepo-deploy.sh
```

Manual equivalent sequence:

```bash
cd /opt/factory23
git fetch --all
git checkout <REPO_BRANCH>
git pull --ff-only

cd backend
docker compose pull
docker compose build --no-cache
docker compose up -d app nginx mysql redis realtime
docker compose --profile workers up -d queue-worker scheduler

docker compose exec app composer install --no-dev --optimize-autoloader
docker compose exec app php artisan migrate --force
docker compose exec app php artisan optimize:clear
docker compose exec app php artisan config:cache
docker compose exec app php artisan route:cache
docker compose exec app php artisan queue:restart
```

---

## 8) Post-Deploy Validation (Mandatory)

### 8.1 Container health

```bash
cd /opt/factory23/backend
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 realtime
docker compose logs --tail=100 queue-worker
```

### 8.2 API health

```bash
curl -sS https://<API_DOMAIN>/api/v1/health
curl -sS https://<API_DOMAIN>/up
```

### 8.3 Realtime health

```bash
curl -sS http://127.0.0.1:8081/healthz
```

### 8.4 Redis checks

```bash
docker compose exec redis redis-cli ping
docker compose exec redis redis-cli INFO memory | head -n 20
```

### 8.5 Queue checks

```bash
docker compose exec app php artisan queue:failed
docker compose logs --tail=200 queue-worker
```

### 8.6 End-to-end tracking lifecycle

Validate in live environment:

1. Agent starts task
2. Agent sends location updates
3. Manager map sees live marker movement
4. Arrival state triggers at destination radius
5. Agent completes task
6. Route history endpoint returns full route

Key API routes expected to work:

- POST /api/v1/agent/tasks/{id}/start
- POST /api/v1/agent/tasks/{id}/location
- POST /api/v1/agent/tasks/{id}/complete
- GET /api/v1/agent/tasks/{id}/route
- GET /api/v1/admin/tasks/{id}/route
- GET /api/v1/admin/agents/locations

---

## 9) Rollback Procedure

If deployment fails after release:

```bash
cd /opt/factory23
git log --oneline -n 5
git checkout <PREVIOUS_COMMIT_SHA>

cd backend
docker compose up -d --build
docker compose --profile workers up -d queue-worker scheduler
docker compose exec app php artisan optimize:clear
docker compose exec app php artisan config:cache
docker compose exec app php artisan route:cache
docker compose exec app php artisan queue:restart
```

If database rollback is needed, use an explicit migration rollback plan. Do not auto-rollback schema on production without backup validation.

---

## 10) Security Hardening Checklist

Complete all:

- APP_DEBUG=false in all production env files
- Redis not publicly exposed
- Realtime internal port not publicly exposed
- Strong DB and mail secrets
- Mapbox secret token only in backend env
- TLS certificates active and auto-renewing
- UFW allows only 22, 80, 443
- Fail2ban enabled for SSH
- Regular OS patching enabled
- Daily backup for MySQL volume and critical env files

---

## 11) Monitoring and Alerting Baseline

Minimum monitors:

1. API endpoint health: https://<API_DOMAIN>/api/v1/health
2. App liveness: https://<API_DOMAIN>/up
3. Realtime liveness: local /healthz through secured probe
4. Queue failure count: alert when failed jobs > 0
5. Redis memory pressure and evictions
6. Container restart spikes

Recommended tooling:

- Uptime Kuma for endpoint checks
- Sentry for Laravel + frontend errors
- Grafana stack for host/container metrics
- Centralized log aggregation

---

## 12) AI Execution Prompt (Copy/Paste)

Use this prompt with your deployment AI:

```text
You are operating on a production DigitalOcean VPS for Factory23.
Follow the file docs/vps-production-post-deploy-runbook.md exactly.

Constraints:
1) Never expose Redis publicly.
2) Never print secrets in logs.
3) Use zero-downtime-safe sequencing where possible.
4) Run mandatory validation in section 8.
5) If validation fails, execute section 9 rollback and report root cause.

Inputs:
- APP_DOMAIN=<APP_DOMAIN>
- API_DOMAIN=<API_DOMAIN>
- VPS_APP_DIR=<VPS_APP_DIR>
- REPO_BRANCH=<REPO_BRANCH>

Output required:
- A step-by-step execution log
- Health check results
- Queue and realtime status
- Final go/no-go deployment decision
```

---

## 13) Definition of Done

Deployment is complete only when all are true:

1. All required containers are healthy and stable
2. API health and app liveness endpoints return success
3. Realtime health endpoint returns healthy status
4. Queue worker and scheduler are running without errors
5. Full start -> location -> arrival -> completion tracking flow works
6. Frontend on Vercel reads live updates over wss://<API_DOMAIN>/tracking-ws
