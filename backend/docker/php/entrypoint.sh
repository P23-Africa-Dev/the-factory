#!/bin/sh
set -e

# Fix ownership of writable directories for PHP-FPM (www-data)
# Only needed when host files are bind-mounted into the container.
if [ -d /var/www/html/storage ]; then
    chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
    chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache
fi

exec "$@"
