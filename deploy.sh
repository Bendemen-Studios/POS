#!/bin/bash
set -e

echo "🚀 Start deployment..."

# 1. Ga naar de map
cd /var/www/bendemen-pos

# 2. Forceer het ophalen van de laatste code en negeer lokale conflicten
git fetch origin main
git reset --hard origin/main

# 3. Controleer of .env bestaat, zo niet, maak hem aan vanuit .env.example
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "⚠️ .env bestand aangemaakt vanuit .env.example!"
  else
    touch .env
    echo "⚠️ .env bestand leeg aangemaakt!"
  fi
  echo "👉 Vergeet niet je gegevens in te vullen via: nano .env"
fi

# 4. Installeer dependencies, bouw en herstart PM2
npm install
npm run build

# Herstart PM2 of start hem als hij nog niet draait
if pm2 describe bendemen-pos > /dev/null 2>&1; then
  pm2 restart bendemen-pos
else
  pm2 start ecosystem.config.js
fi

pm2 save

echo "✨ Deployment succesvol voltooid!"