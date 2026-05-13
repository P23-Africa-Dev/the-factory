SHELL := /bin/sh

up:
	docker-compose up -d --build

down:
	docker-compose down

restart:
	docker-compose down && docker-compose up -d --build

logs:
	docker-compose logs -f --tail=200

realtime-logs:
	docker-compose logs -f --tail=200 realtime

ps:
	docker-compose ps

composer-install:
	docker-compose run --rm app composer install

artisan:
	docker-compose exec app php artisan $(cmd)

migrate:
	docker-compose exec app php artisan migrate

migrate-fresh-seed:
	docker-compose exec app php artisan migrate:fresh --seed

seed:
	docker-compose exec app php artisan db:seed

test:
	docker-compose exec app php artisan test

queue-restart:
	docker-compose exec app php artisan queue:restart

cache-clear:
	docker-compose exec app php artisan optimize:clear

# After git pull: install deps, run migrations, clear caches
refresh:
	docker-compose exec app composer install --no-interaction
	docker-compose exec app php artisan migrate --force
	docker-compose exec app php artisan optimize:clear

shell:
	docker-compose exec app sh

init-laravel:
	docker compose run --rm app composer create-project laravel/laravel .

dev-init:
	./scripts/bootstrap.sh
