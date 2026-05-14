#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/root/factory23"
API_HEALTH_URL="https://api.thefactory23.com/api/v1/health"
LOCAL_HEALTH_URL="http://127.0.0.1:8080/api/v1/health"
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/root/factory23_backup_${TS}"

cd "$ROOT_DIR"

echo "[1/10] Creating rollback snapshot at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/root.env.bak"
cp src/.env "$BACKUP_DIR/laravel.env.bak"
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml.bak"
cp -r docker "$BACKUP_DIR/docker.bak"
cp /etc/nginx/sites-enabled/api.thefactory23.com "$BACKUP_DIR/nginx-api-site.bak" || true

echo "[2/10] Syncing monorepo code (SSH remote)"
cd /var/www/releases/the-factory
git fetch --all --prune
git checkout main
git pull --ff-only origin main
cd "$ROOT_DIR"

echo "[3/10] Validating compose configuration"
docker-compose config >/dev/null

echo "[4/10] Rebuilding and starting core services"
docker-compose up -d --build app nginx mysql redis realtime

echo "[5/10] Installing PHP dependencies"
docker-compose exec -T app composer install --no-interaction --prefer-dist --optimize-autoloader

echo "[6/10] Running migrations safely"
docker-compose exec -T app php artisan migrate --force

echo "[7/10] Enabling workers and scheduler"
docker-compose --profile workers up -d queue-worker scheduler

echo "[8/10] Optimizing Laravel runtime"
docker-compose exec -T app php artisan optimize:clear
docker-compose exec -T app php artisan config:cache
docker-compose exec -T app php artisan route:cache
docker-compose exec -T app php artisan queue:restart

echo "[9/10] Health validation"
LOCAL_CODE="$(curl -s -m 10 -o /dev/null -w "%{http_code}" "$LOCAL_HEALTH_URL")"
PUBLIC_CODE="$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$API_HEALTH_URL")"

if [[ "$LOCAL_CODE" != "200" ]]; then
  echo "Local health check failed with HTTP $LOCAL_CODE"
  exit 1
fi

if [[ "$PUBLIC_CODE" != "200" ]]; then
  echo "Public health check failed with HTTP $PUBLIC_CODE"
  exit 1
fi

echo "[10/10] Deployment completed successfully"
echo "Rollback snapshot: $BACKUP_DIR"
docker-compose ps
