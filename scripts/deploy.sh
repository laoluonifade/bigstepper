#!/usr/bin/env bash
# Deploy a committed version to the Hetzner box (ssh alias `hetzner`).
#   API  → https://api.startajump.com  (systemd: startajump-api, 127.0.0.1:6311)
#   Web  → https://startajump.com      (Caddy serves apps/web/dist)
#   Admin → https://admin.startajump.com (Caddy serves apps/admin/dist; sign-in by emailed code)
# Server env lives in /etc/startajump/api.env; Postgres/Redis in /opt/apps/startajump (docker compose).
#
#   bash scripts/deploy.sh                 deploy main: committed, pushed and green on CI
#   bash scripts/deploy.sh deploy-<tag>    roll back: deploy an earlier release again
#   bash scripts/deploy.sh --list          recent releases, newest first
#
# A rollback redeploys code only; database migrations already run stay applied.
set -euo pipefail

HOST="${DEPLOY_HOST:-hetzner}"
APP_DIR=/var/www/startajump
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" = "--list" ]; then
  git fetch --tags --quiet origin
  git tag --list 'deploy-*' --sort=-creatordate | head -15
  exit 0
fi

ROLLBACK="${1:-}"
if [ -z "$ROLLBACK" ]; then
  [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "✗ Deploys come from main. Switch to main first."; exit 1; }
  [ -z "$(git status --porcelain)" ] || { echo "✗ Uncommitted changes. Commit and push them first:"; git status --short; exit 1; }
  git fetch --quiet origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "✗ main isn't in step with origin/main. Push (or pull) first."; exit 1; }
fi
SHA="$(git rev-parse --verify "${ROLLBACK:-HEAD}^{commit}")"
SHORT="$(git rev-parse --short "$SHA")"
echo "→ Deploying $SHORT: $(git log -1 --format=%s "$SHA")"

if [ -z "$ROLLBACK" ] && [ "${SKIP_CI:-}" != "1" ]; then
  if command -v gh >/dev/null; then
    echo "→ Waiting for CI on $SHORT"
    CONCLUSION=""
    for _ in $(seq 1 60); do
      CONCLUSION="$(gh run list --commit "$SHA" --workflow CI --json status,conclusion --jq '.[0] | (.status + ":" + (.conclusion // ""))' 2>/dev/null || true)"
      case "$CONCLUSION" in
        completed:success) echo "  CI passed"; break ;;
        completed:*) echo "✗ CI failed on $SHORT ($CONCLUSION). Fix it, or SKIP_CI=1 to deploy anyway."; exit 1 ;;
        "") echo "✗ No CI run for $SHORT yet. Push first, or SKIP_CI=1 to deploy anyway."; exit 1 ;;
        *) sleep 10 ;;
      esac
    done
    [ "$CONCLUSION" = "completed:success" ] || { echo "✗ CI still running after 10 minutes. Try again shortly."; exit 1; }
  else
    echo "  (gh isn't installed, so CI wasn't checked)"
  fi
fi

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
git archive "$SHA" | tar -x -C "$BUILD"
# mktemp makes the folder private (700); rsync would copy that onto the app folder and lock Caddy out.
chmod 755 "$BUILD"

echo "→ Syncing code"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude '.env' --exclude '.env.*' --exclude '*.tsbuildinfo' --exclude '.DS_Store' \
  "$BUILD/" "$HOST:$APP_DIR/"

# Env vars the server should take from apps/api/.env.production. Only these, and only when set locally,
# so an empty or missing local value never blanks the server's. Values are never printed.
SYNCED_ENV='EXPO_ACCESS_TOKEN|GOOGLE_WEB_CLIENT_ID|GOOGLE_IOS_CLIENT_ID|GOOGLE_ANDROID_CLIENT_ID|APPLE_BUNDLE_ID|APPLE_TEAM_ID|APPLE_KEY_ID|APPLE_PRIVATE_KEY'
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
  echo $SHA > $APP_DIR/RELEASE
' && systemctl restart startajump-api"

echo "→ Health check"
for site in https://startajump.com https://admin.startajump.com; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$site/" || true)"
  [ "$code" = "200" ] || { echo "✗ $site returned $code"; SITE_DOWN=1; }
done
HEALTHY=""
for _ in $(seq 1 20); do
  if curl -fsS --max-time 5 https://api.startajump.com/v1/health >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 3
done
if [ -z "$HEALTHY" ]; then
  PREVIOUS="$(git tag --list 'deploy-*' --sort=-creatordate | head -1)"
  echo "✗ The API isn't healthy after a minute. Logs: ssh $HOST 'journalctl -u startajump-api -n 80 --no-pager'"
  [ -n "$PREVIOUS" ] && echo "  Roll back with: bash scripts/deploy.sh $PREVIOUS"
  exit 1
fi
echo "  API healthy (Postgres and Redis up)"
[ -z "${SITE_DOWN:-}" ] || { echo "✗ The API is up but the web or admin site isn't serving. Check: ssh $HOST 'ls -ld $APP_DIR $APP_DIR/apps/web/dist'"; exit 1; }
echo "  Web and admin serving"

if [ -z "$ROLLBACK" ]; then
  TAG="deploy-$(date -u +%Y%m%d-%H%M)-$SHORT"
  git tag -a "$TAG" "$SHA" -m "Deployed $SHORT" && git push --quiet origin "$TAG" || echo "  (couldn't push the release tag)"
  echo "Done. Released $TAG"
else
  echo "Done. Rolled back to $ROLLBACK"
fi
