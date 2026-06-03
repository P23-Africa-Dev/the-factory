#!/bin/sh
set -e

# Fix ownership of writable directories for PHP-FPM (www-data)
# Only needed when host files are bind-mounted into the container.
if [ -d /var/www/html/storage ]; then
    chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
    chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache
fi

# Ensure the public/storage symlink exists so avatar and file URLs resolve correctly.
php artisan storage:link --force 2>/dev/null || true

exec "$@"
