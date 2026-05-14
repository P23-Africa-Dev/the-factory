# Production Monorepo Deployment (Factory23)

## 1. Architecture

- Monorepo path: `/var/www/releases/the-factory`
- Backend runtime path (bind mount target): `/root/factory23`
- Live API reverse-proxy: host nginx (`api.thefactory23.com`) -> container nginx (`127.0.0.1:8080`)
- Frontend deployment: external (no runtime on droplet)

## 2. Service Topology

Docker Compose services:

- `app`: Laravel PHP-FPM runtime
- `nginx`: container web server serving Laravel `public/`
- `mysql`: primary relational database
- `redis`: cache/session/queue broker
- `realtime`: Node.js websocket relay
- `queue-worker`: Laravel queue worker (`queue:work redis`)
- `scheduler`: Laravel scheduler loop (`schedule:run` every minute)

Host-level services:

- `nginx`: SSL termination + reverse proxy
- `docker`: container runtime

## 3. Realtime Tracking Flow

- Laravel publishes tracking events to Redis channels using prefix `factory23.tracking`
- Realtime service subscribes to `factory23.tracking.company.*`
- Host/domain websocket path `/tracking-ws` proxies to realtime relay
- Frontend subscribes via websocket and receives filtered task/company events

Flow:

`Laravel -> Redis -> Realtime relay -> /tracking-ws -> Frontend`

## 4. Deployment Workflow

Use:

```bash
cd /root/factory23
./scripts/deploy/production-monorepo-deploy.sh
```

The workflow performs:

1. Pre-deploy rollback snapshot
2. Monorepo pull from SSH remote
3. Compose validation
4. Core service rebuild/restart
5. Composer dependency install
6. `php artisan migrate --force`
7. Worker/scheduler activation
8. Config/route cache optimization
9. Local/public health verification

## 5. Operational Validation Checklist

After each deploy, verify:

- `docker-compose ps` shows all services up
- `https://api.thefactory23.com/api/v1/health` returns HTTP 200
- `https://api.thefactory23.com/tracking-ws` returns websocket handshake response (400/401 expected without full auth handshake)
- Queue worker logs show active processing without crash loops
- Scheduler logs show minute ticks without fatal errors
- Redis connectivity from app and realtime is healthy

## 6. Rollback Procedure

Rollback snapshot path is printed at deploy completion.

Manual rollback sequence:

1. Restore files:
   - root env: `cp <snapshot>/root.env.bak /root/factory23/.env`
   - laravel env: `cp <snapshot>/laravel.env.bak /root/factory23/src/.env`
   - compose: `cp <snapshot>/docker-compose.yml.bak /root/factory23/docker-compose.yml`
   - docker configs: `cp -r <snapshot>/docker.bak /root/factory23/docker`
   - nginx site (if needed): `cp <snapshot>/nginx-api-site.bak /etc/nginx/sites-enabled/api.thefactory23.com`
2. Recreate services:
   - `cd /root/factory23`
   - `docker-compose down`
   - `docker-compose up -d --build`
3. Validate health endpoints and logs.

## 7. Git Remote Policy

Monorepo origin must remain SSH-based:

```bash
git -C /var/www/releases/the-factory remote -v
# origin git@github.com:P23-Africa-Dev/the-factory.git
```

## 8. Production Safety Rules

- Never delete `.env` files
- Never run destructive DB reset commands (`migrate:fresh`, `db:wipe`) in production
- Always keep rollback snapshot before deploy
- Validate health locally and publicly before declaring release complete
