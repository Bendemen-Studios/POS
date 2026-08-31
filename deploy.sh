#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/bendemen-pos"
APP_NAME="bendemen-pos"
BRANCH="main"

printf '\n🚀 BENDEMEN POS deployment starten...\n'

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Start dit script als root (of met sudo)."
  exit 1
fi

cd "$APP_DIR"

command -v git >/dev/null || { echo "❌ git ontbreekt."; exit 1; }
command -v npm >/dev/null || { echo "❌ npm ontbreekt."; exit 1; }
command -v pm2 >/dev/null || { echo "❌ pm2 ontbreekt."; exit 1; }

git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.local
chmod +x "$APP_DIR/deploy.sh" 2>/dev/null || true

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    chmod 600 .env
    echo "⚠️ .env aangemaakt vanuit .env.example. Controleer je productiegegevens."
  else
    touch .env
    chmod 600 .env
    echo "⚠️ .env bestaat nog niet; leeg bestand aangemaakt."
  fi
fi

if [ ! -f package.json ]; then
  echo "❌ package.json ontbreekt na git update. Deployment gestopt."
  exit 1
fi

# package-lock wordt bewust niet uit Git gebruikt. De vorige lockfile was
# incompleet en liet Next.js 14 de ontbrekende SWC dependencies patchen,
# waarna de build faalde. Maak daarom op de VPS altijd een verse lockfile.
rm -f package-lock.json
npm install --omit=dev --no-audit --no-fund

# Volledig nieuwe Next build zodat oude chunks/404's niet blijven hangen.
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

printf '\n✨ Deployment succesvol voltooid!\n'
pm2 status "$APP_NAME"
