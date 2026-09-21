#!/bin/bash
set -Eeuo pipefail

# Simple production deploy: apply the latest GitHub main commit to the VPS.
# No source-code patching, database changes, or service-worker modifications.

APP_DIR="/var/www/bendemen-pos"
APP_NAME="bendemen-pos"
BRANCH="main"
REPO_URL="https://github.com/Bendemen-Studios/POS.git"

printf '\n🚀 BENDEMEN POS deploy starten...\n'

if [ "$(id -u)" -ne 0 ]; then
  echo "❌ Start dit script als root (of met sudo)."
  exit 1
fi

cd "$APP_DIR"
command -v git >/dev/null || { echo "❌ git ontbreekt."; exit 1; }
command -v npm >/dev/null || { echo "❌ npm ontbreekt."; exit 1; }
command -v pm2 >/dev/null || { echo "❌ pm2 ontbreekt."; exit 1; }

# Preserve VPS-only environment files while GitHub is applied.
for env_file in .env .env.local; do
  if [ -f "$env_file" ]; then
    cp -f "$env_file" "/tmp/bendemen-pos-$(basename "$env_file").backup"
  fi
done

git remote set-url origin "$REPO_URL"
echo "📦 Repository: $REPO_URL"
echo "🔄 GitHub $BRANCH ophalen..."
git fetch --prune origin "$BRANCH"
echo "📌 Commit toepassen: $(git rev-parse --short "origin/$BRANCH")"
git reset --hard "origin/$BRANCH"

# Keep VPS-generated dependency lockfile and environment files.
# package-lock.json is intentionally excluded from git clean so Next.js/NPM
# can keep the resolved SWC platform dependencies between deployments.
git clean -fd -e .env -e .env.local -e package-lock.json

# Restore VPS environment files.
for env_file in .env .env.local; do
  backup="/tmp/bendemen-pos-$(basename "$env_file").backup"
  if [ -f "$backup" ]; then
    cp -f "$backup" "$env_file"
    rm -f "$backup"
  fi
done

if [ ! -f package.json ]; then
  echo "❌ package.json ontbreekt na GitHub update."
  exit 1
fi

echo "📦 Dependencies installeren..."
if [ -f package-lock.json ]; then
  echo "🔒 Bestaande package-lock.json gebruiken met npm ci..."
  # Use the VPS-generated lockfile deterministically. The lockfile is kept
  # outside Git for now because it was generated from the production Linux
  # environment and contains the platform-specific optional SWC packages.
  npm ci --include=dev --include=optional --no-audit --no-fund
else
  echo "🆕 Geen package-lock.json gevonden; deze wordt aangemaakt."
  npm install --include=dev --include=optional --no-audit --no-fund --package-lock=true
fi

echo "🏗️ Production build maken..."
rm -rf .next
npm run build

echo "🔄 PM2 herstarten..."
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

echo ""
echo "✅ GitHub commit toegepast: $(git rev-parse --short HEAD)"
echo "✅ Build succesvol"
echo "✅ PM2 online"
printf '\n✨ Deploy succesvol voltooid!\n'
pm2 status "$APP_NAME"
