#!/usr/bin/env bash
# Deploy the current working tree to the Hetzner box (ssh alias `hetzner`).
#   API  → https://api.startajump.com  (systemd: startajump-api, 127.0.0.1:6311)
#   Web  → https://startajump.com      (Caddy serves apps/web/dist)
#   Admin → https://admin.startajump.com (Caddy serves apps/admin/dist; sign-in by emailed code)
# Server env lives in /etc/startajump/api.env; Postgres/Redis in /opt/apps/startajump (docker compose).
set -euo pipefail

HOST="${DEPLOY_HOST:-hetzner}"
APP_DIR=/var/www/startajump
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Syncing code"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude '.env' --exclude '.env.*' --exclude '*.tsbuildinfo' --exclude '.DS_Store' \
  "$ROOT/" "$HOST:$APP_DIR/"

# Env vars the server should take from apps/api/.env.production. Only these, and only when set locally,
# so an empty or missing local value never blanks the server's. Values are never printed.
SYNCED_ENV='GOOGLE_WEB_CLIENT_ID|GOOGLE_IOS_CLIENT_ID|GOOGLE_ANDROID_CLIENT_ID|APPLE_BUNDLE_ID|APPLE_TEAM_ID|APPLE_KEY_ID|APPLE_PRIVATE_KEY'
ENV_LINES="$(grep -E "^($SYNCED_ENV)=.+" "$ROOT/apps/api/.env.production" || true)"
if [ -n "$ENV_LINES" ]; then
  echo "→ Syncing env: $(printf '%s\n' "$ENV_LINES" | cut -d= -f1 | tr '\n' ' ')"
  printf '%s\n' "$ENV_LINES" | ssh "$HOST" 'set -euo pipefail
    umask 077
    new=$(mktemp); merged=$(mktemp)
    cat > "$new"
    keys=$(cut -d= -f1 "$new" | paste -sd"|" -)
    cp /etc/startajump/api.env /etc/startajump/api.env.bak
    { grep -vE "^($keys)=" /etc/startajump/api.env || true; cat "$new"; } > "$merged"
    cat "$merged" > /etc/startajump/api.env
    rm -f "$new" "$merged"'
fi

echo "→ Installing, building, migrating, restarting"
ssh "$HOST" "chown -R deploy:deploy $APP_DIR && sudo -u deploy bash -c '
  set -euo pipefail
  cd $APP_DIR
  pnpm install --frozen-lockfile --filter @jump/api... --filter @jump/web... --filter @jump/admin...
  pnpm --filter @jump/api build
  VITE_API_URL=https://api.startajump.com/v1 pnpm --filter @jump/web build
  VITE_API_URL=https://api.startajump.com/v1 VITE_APP_ORIGIN=https://startajump.com pnpm --filter @jump/admin build
  cd apps/api
  set -a; . /etc/startajump/api.env; set +a
  case \"\$DATABASE_URL\" in *@127.0.0.1:5435/startajump) ;; *) echo \"Refusing to migrate: unexpected DATABASE_URL\"; exit 1;; esac
  npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:run
' && systemctl restart startajump-api && sleep 4 && systemctl is-active startajump-api"

echo "→ Health check"
# 401 is healthy here: the API is up and rejecting an anonymous session check.
curl -sS -o /dev/null -w "api: %{http_code} (401 = up)\n" https://api.startajump.com/v1/auth/session || true
echo "Done."
