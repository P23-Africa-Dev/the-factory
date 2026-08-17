# syntax=docker/dockerfile:1

# Pinned to Debian Bookworm: the default php:8.3-fpm tag moved to Debian Trixie,
# which removed libc-client-dev (the UW IMAP c-client lib) needed to build the
# imap PHP extension. Bookworm still ships it. Revisit if migrating off the imap
# extension (e.g. to webklex/php-imap).
FROM php:8.3-fpm-bookworm

RUN apt-get update && apt-get install -y \
    git curl unzip zip \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    libc-client-dev \
    libkrb5-dev \
 && docker-php-ext-configure imap --with-kerberos --with-imap-ssl \
 && docker-php-ext-install \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    gd \
    zip \
    imap

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Resolve dependencies before copying the app so this layer is only rebuilt when
# the lock file changes; ordinary code pushes reuse the cached vendor/ instead of
# re-downloading every package from GitHub.
COPY src/composer.json src/composer.lock ./

# GitHub throttles anonymous dist downloads from shared CI IPs with HTTP 429, and
# composer.json pins preferred-install=dist so there is no source fallback. The
# secret carries a token (higher quota), the cache mount keeps already-downloaded
# archives across attempts, and capped parallelism reduces burst pressure.
RUN --mount=type=secret,id=composer_auth \
    --mount=type=cache,target=/tmp/composer-cache,sharing=locked \
    export COMPOSER_CACHE_DIR=/tmp/composer-cache \
    && export COMPOSER_MAX_PARALLEL_HTTP=6 \
    && if [ -s /run/secrets/composer_auth ]; then \
         COMPOSER_AUTH="$(cat /run/secrets/composer_auth)"; \
         export COMPOSER_AUTH; \
       fi \
    && for attempt in 1 2 3 4 5; do \
         composer install \
           --no-dev \
           --no-scripts \
           --no-autoloader \
           --prefer-dist \
           --no-interaction && exit 0; \
         echo "composer install attempt ${attempt} failed; retrying in $((attempt * 20))s"; \
         sleep $((attempt * 20)); \
       done; \
    exit 1

COPY src/ .

# Autoloader is generated here instead of during install because the classmap and
# Laravel's package:discover script both need the application source.
RUN composer dump-autoload --no-dev --optimize --no-interaction

# Pre-warm caches using placeholder env (overridden at runtime by K8s init container)
RUN php artisan config:cache || true
RUN php artisan route:cache || true
RUN php artisan view:cache || true

CMD ["php-fpm"]
