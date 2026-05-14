# Laravel API + Docker (MySQL + Redis + Nginx)

This backend is optimized for API-first Laravel development with Docker and is structured to evolve cleanly into production.

## 1) Project Structure

```text
backend/
   docs/
      features/
         health.md
      templates/
         feature-template.md
      README.md
  docker/
    nginx/
      default.conf
    php/
      conf.d/
        custom.ini
      Dockerfile
    laravel.env.example
  scripts/
    bootstrap.sh
    aliases.sh
  src/                        # Laravel app lives here
  .dockerignore
  .env.example                # Docker Compose environment
  docker-compose.yml
   openapi/
      openapi.yaml
  Makefile
  README.md
```

## 2) Services Overview

- `app`: PHP-FPM 8.3 + Composer + required Laravel extensions.
- `nginx`: Public HTTP entrypoint, routes to `public/index.php`.
- `mysql`: MySQL 8.4 for relational storage.
- `redis`: Redis 7 for cache, queues, sessions.
- `realtime`: Node.js WebSocket relay for live task tracking events.
- `queue-worker` and `scheduler`: Optional worker profile (`workers`).

## 3) Step-by-Step Setup

### Prerequisites

- Docker Desktop (or Docker Engine) + Docker Compose v2
- WSL2 recommended on Windows for better volume performance

### Initial bootstrap

From `backend/`:

```bash
cp .env.example .env
./scripts/bootstrap.sh
```

What bootstrap does:

1. Copies root `.env` if missing.
2. Creates Laravel in `src/` if not present.
3. Writes Docker-compatible Laravel env values.
4. Builds/starts containers.
5. Generates app key, runs migrations, clears caches.

API becomes available at:

- `http://localhost:8080`

Realtime WebSocket relay becomes available at:

- `ws://localhost:8081`

Health route to verify quickly:

```bash
docker compose exec app php artisan route:list
```

### Manual flow (if preferred)

```bash
cp .env.example .env
docker compose run --rm app composer create-project laravel/laravel .
cp docker/laravel.env.example src/.env
docker compose up -d --build
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate --force
```

## 4) API-Only Laravel Recommendations

After Laravel is installed in `src/`:

1. Keep routes in `routes/api.php`.
2. Remove web routes/views if not needed.
3. Use API Resources + Form Requests for all endpoints.
4. Use Sanctum (or Passport) for token auth.
5. Keep business logic in Services, not Controllers.

## 5) Queue + Scheduler

Worker services are profile-based and not started by default.

Start them when needed:

```bash
docker compose --profile workers up -d queue-worker scheduler
```

Restart queues after deploy/config changes:

```bash
docker compose exec app php artisan queue:restart
```

## 6) Useful Commands

Using `Makefile` from `backend/`:

```bash
make up
make down
make logs
make migrate
make seed
make test
make cache-clear
```

Load optional aliases:

```bash
. ./scripts/aliases.sh
```

## 7) Environment Configuration

### Compose env (`backend/.env`)

- Container-level values (ports, DB creds, timezone).
- Used by `docker-compose.yml` and service startup.

### Laravel env (`backend/src/.env`)

Set these essentials:

- `DB_HOST=mysql`
- `DB_PORT=3306`
- `REDIS_HOST=redis`
- `CACHE_STORE=redis`
- `QUEUE_CONNECTION=redis`
- `SESSION_DRIVER=redis`
- `TASK_TRACKING_REDIS_CHANNEL_PREFIX=factory23.tracking`

## 8) Nginx Notes

Nginx config (`docker/nginx/default.conf`) is already configured for Laravel API routing:

- Root at `/var/www/html/public`
- `try_files` fallback to `/index.php`
- PHP requests proxied to `app:9000`

## 9) Production Readiness (What Changes)

For a SaaS targeting tens of thousands of users across Africa, move from local-compose style to orchestrated deployment and managed services:

1. Replace local MySQL/Redis with managed offerings (RDS/Aurora, ElastiCache/MemoryDB, Cloud SQL, Azure DB/Cache).
2. Remove fixed host port mappings; use internal networking + ingress/load balancer.
3. Use separate deploy units for:
   - API pods/containers
   - Queue workers (horizontally scalable)
   - Scheduler singleton
4. Add observability stack:
   - Central logs (ELK/OpenSearch/Datadog)
   - Metrics (Prometheus/Grafana)
   - Error tracking (Sentry/Bugsnag)
5. Run queue monitoring with Laravel Horizon when using Redis queues.
6. Store user uploads in object storage (S3-compatible), not local disk.
7. Use CDN + regional edge caching to reduce latency for African geographies.
8. Add read replicas and caching strategy for high-read traffic.
9. Harden security:
   - Rotate secrets via secret manager
   - TLS everywhere
   - Restrict DB/Redis network access
   - Least-privilege IAM
10. CI/CD:

- Build immutable images
- Run tests, static analysis, security scans
- Zero-downtime deploy (blue/green or rolling)

## 10) Common Pitfalls and How to Avoid Them

1. **Mount performance on Windows is slow**
   - Use WSL2 filesystem (`\\wsl$`) for the project when possible.
2. **Queue workers running old code/config**
   - Always run `php artisan queue:restart` after deploy.
3. **Misaligned env values between root and Laravel**
   - Keep Docker `.env` and `src/.env` synchronized for DB/Redis settings.
4. **N+1 query regressions**
   - Enforce eager loading and inspect with Telescope/Debugbar in non-prod.
5. **No DB indexes on filter/sort columns**
   - Add proper indexes early for API-heavy endpoints.

## 11) Next Recommended Backend Steps

1. Add `Sanctum` auth and issue SPA/API tokens.
2. Create base API response macro/resource pattern (`success`, `message`, `data`, `errors`).
3. Add API versioning prefix (`/api/v1`).
4. Add feature tests for auth, validation, and key business flows.

## 12) API Documentation

All backend integrations must be documented inside `backend/` and kept current with code changes.

Documentation entry points:

1. Human-readable integration docs: [docs/README.md](docs/README.md)
2. Feature-level documentation: [docs/features/health.md](docs/features/health.md)
3. Reusable feature documentation template: [docs/templates/feature-template.md](docs/templates/feature-template.md)
4. Machine-readable API contract: [openapi/openapi.yaml](openapi/openapi.yaml)

Recommended workflow for every new backend feature:

1. Implement route, validation, controller/service logic, and tests.
2. Update the relevant feature markdown doc in `docs/features/`.
3. Update `openapi/openapi.yaml` with the endpoint contract.
4. Call out breaking changes explicitly in the feature doc and pull request.
