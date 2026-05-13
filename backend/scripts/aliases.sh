#!/usr/bin/env sh

alias dcu='docker compose up -d --build'
alias dcd='docker compose down'
alias dcl='docker compose logs -f --tail=200'
alias dce='docker compose exec app'
alias art='docker compose exec app php artisan'
alias pest='docker compose exec app php artisan test'
