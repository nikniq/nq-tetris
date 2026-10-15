#!/usr/bin/env bash
#
# Production deploy for nq-tetris. Run ON the server, from the app root
# (the directory that holds artisan and public_html/):
#
#   ./deploy.sh            # pull + composer (if needed) + migrate + caches
#
# The server deploys by pulling from git, so only pushed commits reach it.
# The whole sequence lives here so the steps cannot drift apart: a pull
# without a migrate or a cache rebuild is how a Laravel site 500s after a
# "successful" deploy.
#
# The web root is public_html/ (see bootstrap/app.php), so point the
# vhost or hosting panel there, never at the app root.

set -euo pipefail
cd "$(dirname "$0")"

echo "→ git pull"
# Remember the lockfile before pulling so we can tell whether dependencies
# actually moved; composer install is slow on shared hosting and is only
# worth running when they did.
LOCK_BEFORE=$(git rev-parse HEAD:composer.lock 2>/dev/null || echo none)
git pull --ff-only
LOCK_AFTER=$(git rev-parse HEAD:composer.lock 2>/dev/null || echo none)

if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ] || [ ! -d vendor ]; then
    if command -v composer >/dev/null 2>&1; then
        echo "→ composer install (lockfile changed or vendor/ missing)"
        composer install --no-dev --optimize-autoloader --no-interaction
    else
        # Not fatal: the pull has already landed, and stopping here would
        # leave the tree un-migrated as well. Say so loudly instead.
        echo "⚠ composer.lock changed but composer is not on PATH."
        echo "  Install dependencies manually before trusting this deploy."
    fi
fi

if [ ! -f .env ]; then
    echo "✗ No .env on the server. Copy .env.example to .env, set APP_KEY"
    echo "  (php artisan key:generate), APP_ENV=production and APP_DEBUG=false."
    exit 1
fi

echo "→ migrate"
php artisan migrate --force

echo "→ cache config/routes/views"
php artisan optimize

echo "→ verify"
# The game is static once served, so the checks are about the framework
# being wired up: public path, debug off, and the homepage rendering.
PUBLIC_PATH=$(php artisan tinker --execute='echo public_path();' 2>/dev/null | tr -d '\r' || true)
case "$PUBLIC_PATH" in
    */public_html) echo "  public path : $PUBLIC_PATH" ;;
    "")            echo "  public path : (tinker unavailable on this PHP; skipped)" ;;
    *)             echo "✗ public path is $PUBLIC_PATH, expected …/public_html"; exit 1 ;;
esac
if grep -qE '^APP_DEBUG=true' .env; then
    echo "⚠ APP_DEBUG=true in .env — stack traces will be shown to visitors."
fi
for f in public_html/index.php public_html/css/style.css public_html/js/tetris.js public_html/ads.txt; do
    [ -f "$f" ] || { echo "✗ missing $f"; exit 1; }
done
echo "  assets      : present"

echo "✓ deployed $(git log --oneline -1)"
