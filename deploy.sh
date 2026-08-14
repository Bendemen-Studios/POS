#!/bin/bash
echo "🚀 Start deployment..."

# 1. Haal laatste code op van GitHub
git pull origin main

# 2. Controleer of .env bestaat, zo niet, maak hem aan vanuit .env.example
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️ .env bestand ontbrak en is aangemaakt. Vul handmatig je gegevens in!"
fi

# 3. Installeer dependencies, bouw en herstart PM2
npm install
npm run build
pm2 restart bendemen-pos

echo "✨ Deployment voltooid!"