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

COPY src/ .

# Install locked production dependencies.
RUN composer install \
    --no-dev \
    --optimize-autoloader \
    --prefer-dist \
    --no-interaction

# Pre-warm caches using placeholder env (overridden at runtime by K8s init container)
RUN php artisan config:cache || true
RUN php artisan route:cache || true
RUN php artisan view:cache || true

CMD ["php-fpm"]