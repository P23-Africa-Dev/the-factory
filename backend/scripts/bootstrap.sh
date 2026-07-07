#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
fi

mkdir -p src

if [ ! -f src/artisan ]; then
  docker-compose run --rm app composer create-project laravel/laravel .
fi

cp src/.env.example src/.env

# Align Laravel env values with Docker service names
sed -i 's/^APP_NAME=.*/APP_NAME="Factory23"/' src/.env
sed -i 's|^APP_URL=.*|APP_URL=http://localhost:8080|' src/.env
sed -i 's/^DB_CONNECTION=.*/DB_CONNECTION=mysql/' src/.env
sed -i 's/^DB_HOST=.*/DB_HOST=mysql/' src/.env
sed -i 's/^DB_PORT=.*/DB_PORT=3306/' src/.env
sed -i 's/^DB_DATABASE=.*/DB_DATABASE=factory_api/' src/.env
sed -i 's/^DB_USERNAME=.*/DB_USERNAME=factory_user/' src/.env
sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=factory_password/' src/.env
sed -i 's/^CACHE_STORE=.*/CACHE_STORE=redis/' src/.env
sed -i 's/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=redis/' src/.env
sed -i 's/^SESSION_DRIVER=.*/SESSION_DRIVER=redis/' src/.env
sed -i 's/^REDIS_HOST=.*/REDIS_HOST=redis/' src/.env
sed -i 's/^REDIS_PORT=.*/REDIS_PORT=6379/' src/.env

if ! grep -q '^SESSION_CONNECTION=' src/.env; then
  echo 'SESSION_CONNECTION=default' >> src/.env
fi

if ! grep -q '^SESSION_SECURE_COOKIE=' src/.env; then
  echo 'SESSION_SECURE_COOKIE=false' >> src/.env
fi

docker-compose up -d --build

docker-compose exec app php artisan key:generate
docker-compose exec app php artisan migrate --force
docker-compose exec app php artisan optimize:clear

echo "Bootstrap complete. API should be available at http://localhost:8080"
