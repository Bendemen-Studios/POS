#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/bendemen-pos"
APP_NAME="bendemen-pos"
BRANCH="main"
REPO_URL="https://github.com/Bendemen-Studios/POS.git"
ENV_BACKUP="/tmp/bendemen-pos-env.$$.backup"
PRELOAD_SCRIPT="$APP_DIR/scripts/preload-products.sh"
CRON_MARKER="# BDM POS product preload"

printf '\n🚀 BENDEMEN POS deployment starten...\n'

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Start dit script als root (of met sudo)."
  exit 1
fi

cd "$APP_DIR"

command -v git >/dev/null || { echo "❌ git ontbreekt."; exit 1; }
command -v npm >/dev/null || { echo "❌ npm ontbreekt."; exit 1; }
command -v pm2 >/dev/null || { echo "❌ pm2 ontbreekt."; exit 1; }

for env_file in .env .env.local; do
  if [ -f "$env_file" ]; then
    cp -f "$env_file" "$ENV_BACKUP.$(basename "$env_file")"
  fi
done

git remote set-url origin "$REPO_URL"
echo "📦 Repository: $REPO_URL"
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.local

for env_file in .env .env.local; do
  backup="$ENV_BACKUP.$(basename "$env_file")"
  if [ -f "$backup" ]; then
    cp -f "$backup" "$env_file"
    rm -f "$backup"
  fi
done

# Apply the active POS queue fix to pages/index.js. The POS currently contains
# the queue implementation directly in the page, so the reusable hook alone
# is not sufficient. Keep this idempotent: if the source is already patched,
# the replacements simply do nothing.
if command -v python3 >/dev/null 2>&1 && [ -f "$APP_DIR/pages/index.js" ]; then
  python3 - <<'PY'
from pathlib import Path

path = Path('/var/www/bendemen-pos/pages/index.js')
s = path.read_text(encoding='utf-8')
original = s

s = s.replace(
    "        if (!(await checkServerConnection())) return;\n        setIsSyncing(true);",
    "        // Do not gate queue recovery on the separate health endpoint.\n        // The actual order endpoint is the source of truth for availability.\n        setIsSyncing(true);"
)

s = s.replace(
    "if (res.status === 404) res = await fetchWithServerCheck('/api/woocommerce/offline-order',",
    "if (res.status === 404 || res.status === 409 || res.status >= 500) res = await fetchWithServerCheck('/api/woocommerce/offline-order',"
)

s = s.replace(
    "healthTimer = setInterval(() => backgroundSync(false), 10000);",
    "healthTimer = setInterval(() => backgroundSync(false), 5000);"
)

# Do not report a slow but successful WooCommerce checkout as offline.
s = s.replace(
    "fetchWithServerCheck('/api/woocommerce/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) }, 10000)",
    "fetchWithServerCheck('/api/woocommerce/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) }, 45000)"
)

# Give the server health endpoint enough time on a busy VPS.
s = s.replace(
    "setTimeout(() => controller.abort(), 1200)",
    "setTimeout(() => controller.abort(), 5000)"
)

if s != original:
    path.write_text(s, encoding='utf-8')
    print('✅ Active POS sync patched: 45s checkout + 5s health + 5s queue retry + no health gate.')
else:
    print('ℹ️ Active POS source already patched or source pattern changed; no page patch applied.')
PY
else
  echo "⚠️ python3 of pages/index.js ontbreekt; actieve POS queue-patch niet toegepast."
fi

# Keep the service worker in sync so its checkout timeout cannot turn a slow
# successful order into a false offline/queued message.
if command -v python3 >/dev/null 2>&1 && [ -f "$APP_DIR/public/sw.js" ]; then
  python3 - <<'PY'
from pathlib import Path

path = Path('/var/www/bendemen-pos/public/sw.js')
s = path.read_text(encoding='utf-8')
original = s

s = s.replace("bendemen-pos-v21", "bendemen-pos-v22")
s = s.replace("const CHECKOUT_TIMEOUT = 15000;", "const CHECKOUT_TIMEOUT = 45000;")

if s != original:
    path.write_text(s, encoding='utf-8')
    print('✅ Service worker patched: v22 + 45s checkout timeout.')
else:
    print('ℹ️ Service worker already patched or source pattern changed; no change applied.')
fi
PY
else
  echo "⚠️ python3 of public/sw.js ontbreekt; service-worker patch niet toegepast."
fi

chmod +x "$APP_DIR/deploy.sh" 2>/dev/null || true
echo "✅ Code bijgewerkt naar $(git rev-parse --short HEAD)"

if [ ! -f package.json ]; then
  echo "❌ package.json ontbreekt na git update. Deployment gestopt."
  exit 1
fi

rm -rf node_modules package-lock.json
npm cache verify >/dev/null 2>&1 || true
npm install --include=dev --no-audit --no-fund --package-lock=true

rm -rf .next
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  if [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js --update-env
  else
    pm2 start npm --name "$APP_NAME" -- start
  fi
fi

pm2 save
sleep 2

if ! pm2 describe "$APP_NAME" | grep -q "online"; then
  echo "❌ PM2 kon $APP_NAME niet online krijgen."
  pm2 logs "$APP_NAME" --lines 30 --nostream || true
  exit 1
fi

# VPS productcache direct én iedere 5 minuten warm houden.
# De cronjob draait lokaal op de VPS en gebruikt dus geen publieke DNS/proxy.
if command -v curl >/dev/null 2>&1 && [ -f "$PRELOAD_SCRIPT" ]; then
  chmod +x "$PRELOAD_SCRIPT"
  CRON_LINE="*/5 * * * * $PRELOAD_SCRIPT >> /var/log/bendemen-pos-preload.log 2>&1"
  TMP_CRON="$(mktemp)"
  crontab -l 2>/dev/null | grep -v "$CRON_MARKER" | grep -v "preload-products.sh" > "$TMP_CRON" || true
  printf '%s\n' "$CRON_MARKER" >> "$TMP_CRON"
  printf '%s\n' "$CRON_LINE" >> "$TMP_CRON"
  crontab "$TMP_CRON"
  rm -f "$TMP_CRON"

  echo "🔥 VPS productcache preload starten..."
  if "$PRELOAD_SCRIPT"; then
    echo "✅ VPS productcache is voorgeladen."
  else
    echo "⚠️ VPS preload kon nog niet worden uitgevoerd; cron probeert dit opnieuw."
  fi
else
  echo "⚠️ curl of preload-script ontbreekt; automatische VPS preload niet ingesteld."
fi

printf '\n✨ Deployment succesvol voltooid!\n'
pm2 status "$APP_NAME"
