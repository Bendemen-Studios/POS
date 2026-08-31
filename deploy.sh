#!/bin/bash
set -Eeuo pipefail

APP_DIR="/var/www/bendemen-pos"
APP_NAME="bendemen-pos"
BRANCH="main"
REPO_URL="https://github.com/Bendemen-Studios/POS.git"

printf '\n🚀 BENDEMEN POS deployment starten...\n'

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Start dit script als root (of met sudo)."
  exit 1
fi

cd "$APP_DIR"

command -v git >/dev/null || { echo "❌ git ontbreekt."; exit 1; }
command -v npm >/dev/null || { echo "❌ npm ontbreekt."; exit 1; }
command -v pm2 >/dev/null || { echo "❌ pm2 ontbreekt."; exit 1; }

# Zorg dat deze VPS altijd de juiste Bendemen-Studios repository gebruikt.
git remote set-url origin "$REPO_URL"
echo "📦 Repository: $REPO_URL"

# Haal de actuele main op. Lokale wijzigingen mogen worden overschreven:
# de GitHub main branch is de bron van waarheid voor deze deployment.
git fetch --prune origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e .env -e .env.local
chmod +x "$APP_DIR/deploy.sh" 2>/dev/null || true

echo "✅ Code bijgewerkt naar $(git rev-parse --short HEAD)"

if [ ! -f package.json ]; then
  echo "❌ package.json ontbreekt na git update. Deployment gestopt."
  exit 1
fi

# POS polling bewust op 5 seconden zetten.
# Dit houdt de serverstatus en offline-order synchronisatie actueel zonder
# dat hiervoor handmatig een reload nodig is.
if grep -q "}, 15000);" pages/index.js; then
  sed -i '0,/}, 15000);/s//}, 5000);/' pages/index.js
  echo "🔄 POS status/offline-order polling ingesteld op 5 seconden."
elif grep -q "}, 5000);" pages/index.js; then
  echo "✅ POS polling staat al op 5 seconden."
else
  echo "⚠️ POS polling-regel niet gevonden; bestaande code blijft ongewijzigd."
fi

# Next.js 14 probeert een incomplete/out-of-sync lockfile te patchen voor SWC.
# Daarom maken we op de VPS eerst een volledig schone dependency-installatie.
rm -rf node_modules package-lock.json
npm cache verify >/dev/null 2>&1 || true
npm install --include=dev --no-audit --no-fund --package-lock=true

# Volledig schone Next build.
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
