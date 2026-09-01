#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/bendemen-pos"
APP_NAME="bendemen-pos"
BRANCH="main"
REPO_URL="https://github.com/Bendemen-Studios/POS.git"
ENV_BACKUP="/tmp/bendemen-pos-env.$$.backup"

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

# Warm de VPS-productcache direct na een succesvolle deployment.
# Next draait standaard op poort 3000; als deze endpoint niet direct beschikbaar is,
# blijft de deployment alsnog geslaagd en warmt de eerste POS-request de cache.
if command -v curl >/dev/null 2>&1; then
  echo "🔥 VPS productcache preload starten..."
  if curl -fsS --max-time 90 -H 'Cache-Control: no-cache' 'http://127.0.0.1:3000/api/woocommerce/products?preload=1' >/dev/null; then
    echo "✅ VPS productcache is voorgeladen."
  else
    echo "⚠️ VPS preload kon nog niet worden uitgevoerd; de eerste POS-request warmt de cache automatisch."
  fi
fi

printf '\n✨ Deployment succesvol voltooid!\n'
pm2 status "$APP_NAME"
