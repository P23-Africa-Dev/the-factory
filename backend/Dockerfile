FROM php:8.3-fpm

RUN apt-get update && apt-get install -y \
    git curl unzip zip \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
 && docker-php-ext-install \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    gd \
    zip

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